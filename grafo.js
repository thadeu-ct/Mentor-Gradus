document.addEventListener("DOMContentLoaded", () => {
    // 1. Registra a extensão dagre (layout hierárquico) se disponível
    try {
        if (typeof cytoscapeDagre !== 'undefined') {
            cytoscape.use(cytoscapeDagre);
        }
    } catch (e) {
        console.warn("Aviso Cytoscape:", e);
    }

    // 2. Inicializa a lógica da página
    inicializarPaginaGrafo();
});

async function inicializarPaginaGrafo() {
    console.log("Grafo: Iniciando configuração...");

    // Hook: Sobrescreve a função global do app.js
    // Quando clicar num chip na sidebar, chama o atualizarGrafo daqui
    window.processarEstadoDoBackend = function() {
        console.log("Grafo: Seleção alterada, redesenhando...");
        atualizarGrafo();
    };

    // 3. Inicializa Sidebar e Componentes do app.js
    try {
        if (typeof window.carregarDadosIniciais === 'function') {
            await window.carregarDadosIniciais(); // Baixa formacoes e dominios
            
            if (typeof window.initializeChipSelectors === 'function') {
                window.initializeChipSelectors();
            }
            if (typeof window.initializeSidebar === 'function') {
                window.initializeSidebar();
            }
        } else {
            console.error("Erro: app.js não carregado.");
        }

        // 4. CARREGA AS MATÉRIAS DA API PYTHON (A Correção!)
        if (!window.materiasData || window.materiasData.length === 0) {
            console.log("Grafo: Buscando matérias no servidor...");
            
            try {
                const response = await fetch('/api/get-todas-materias');
                if (!response.ok) throw new Error('Erro na API Python');
                
                window.materiasData = await response.json();
                console.log(`Grafo: ${window.materiasData.length} matérias carregadas.`);
            } catch (err) {
                console.error("Falha ao buscar matérias:", err);
                alert("Erro ao carregar matérias. Verifique se o backend está rodando.");
            }
        }

        // 5. Configura o botão de toggle da sidebar
        const toggleBtn = document.getElementById("toggle-sidebar-btn");
        const cyDiv = document.getElementById("cy");
        if (toggleBtn && cyDiv) {
            toggleBtn.addEventListener("click", () => {
                cyDiv.classList.toggle("recolhido");
                setTimeout(() => {
                    if (window.cyInstance) window.cyInstance.resize();
                }, 350);
            });
        }

    } catch (error) {
        console.error("Erro fatal ao inicializar grafo:", error);
    }
}

function atualizarGrafo() {
    // 1. Captura Chips
    const formacaoChip = document.querySelector("#formacoes-selection .chip-selected");
    const enfaseChip = document.querySelector("#enfase-selection .chip-selected");
    const dominiosChips = Array.from(document.querySelectorAll("#dominios-selection .chip-selected"));

    // Se nada selecionado, limpa
    if (!formacaoChip) {
        if (window.cyInstance) window.cyInstance.elements().remove();
        return;
    }

    const nomeCurso = formacaoChip.dataset.value;
    const nomeEnfase = enfaseChip ? enfaseChip.dataset.value : null;
    const nomesDominios = dominiosChips.map(chip => chip.dataset.value);

    // 2. Coleta Códigos Obrigatórios
    let codigosParaExibir = new Set();

    // A) Curso Base
    const dadosCurso = window.dadosFormacoes[nomeCurso];
    if (dadosCurso && dadosCurso.obrigatórias) {
        dadosCurso.obrigatórias.forEach(c => codigosParaExibir.add(c));
    }

    // B) Ênfase
    if (nomeEnfase && dadosCurso.enfase && dadosCurso.enfase[nomeEnfase]) {
        const dadosEnfase = dadosCurso.enfase[nomeEnfase];
        if (dadosEnfase.obrigatórias) {
            dadosEnfase.obrigatórias.forEach(c => codigosParaExibir.add(c));
        }
    }

    // C) Domínios
    nomesDominios.forEach(dominio => {
        const dadosDominio = window.dadosDominios[dominio];
        if (dadosDominio && dadosDominio.obrigatórias) {
            dadosDominio.obrigatórias.forEach(c => codigosParaExibir.add(c));
        }
    });

    // 3. Filtra Matérias + Pré-requisitos
    // (Lógica: Se a matéria é obrigatória, ela entra. E se ela entra, os pais dela entram também, recursivamente?)
    // Por enquanto, vamos exibir apenas as EXPLICITAMENTE listadas para não poluir demais.
    // Se quiser ver os pré-requisitos mesmo que não sejam do curso (ex: Calculo 1 que libera Calculo 2), 
    // a lista de obrigatórias do curso geralmente já contém a cadeia toda.
    
    const materiasFiltradas = window.materiasData.filter(m => codigosParaExibir.has(m.codigo));

    console.log(`Grafo: Desenhando ${materiasFiltradas.length} nós.`);

    // 4. Desenha
    desenharCytoscape(materiasFiltradas);
}

function desenharCytoscape(materias) {
    const container = document.getElementById('cy');
    const elements = [];
    const materiasSet = new Set(materias.map(m => m.codigo));

    // Nós
    materias.forEach(mat => {
        elements.push({
            group: 'nodes',
            data: { id: mat.codigo, label: mat.codigo, nomeCompleto: mat.nome }
        });
    });

    // Arestas
    materias.forEach(mat => {
        if (mat.prereqs) {
            mat.prereqs.forEach(grupo => {
                grupo.forEach(prereqCod => {
                    // Só cria seta se ambos os nós existirem no grafo
                    if (materiasSet.has(prereqCod)) {
                        elements.push({
                            group: 'edges',
                            data: { source: prereqCod, target: mat.codigo }
                        });
                    }
                });
            });
        }
    });

    // Inicializa ou Atualiza
    if (window.cyInstance) {
        window.cyInstance.json({ elements: elements });
        window.cyInstance.layout({ name: 'dagre', rankDir: 'LR', nodeSep: 30, rankSep: 100 }).run();
    } else {
        window.cyInstance = cytoscape({
            container: container,
            elements: elements,
            style: getCytoscapeStyle(),
            layout: { name: 'dagre', rankDir: 'LR', nodeSep: 30, rankSep: 100 }
        });
        configurarEventosMouse(window.cyInstance);
    }
}

function getCytoscapeStyle() {
    return [
        {
            selector: 'node',
            style: {
                'background-color': '#3498db',
                'label': 'data(label)',
                'color': '#333',
                'font-size': '10px',
                'font-weight': 'bold',
                'text-valign': 'center',
                'text-halign': 'center',
                'width': '55px', 'height': '55px',
                'border-width': 2, 'border-color': '#fff'
            }
        },
        {
            selector: 'edge',
            style: {
                'width': 2,
                'line-color': '#bdc3c7',
                'target-arrow-color': '#bdc3c7',
                'target-arrow-shape': 'triangle',
                'curve-style': 'bezier'
            }
        },
        { selector: '.highlight', style: { 'background-color': '#f1c40f', 'border-color': '#333', 'border-width': 3 } },
        { selector: '.prerequisito', style: { 'background-color': '#e74c3c', 'line-color': '#e74c3c', 'target-arrow-color': '#e74c3c', 'width': 4, 'z-index': 999 } },
        { selector: '.libera', style: { 'background-color': '#27ae60', 'line-color': '#27ae60', 'target-arrow-color': '#27ae60', 'width': 4, 'z-index': 999 } },
        { selector: '.faded', style: { 'opacity': 0.1 } }
    ];
}

function configurarEventosMouse(cy) {
    cy.on('mouseover', 'node', function(e) {
        const node = e.target;
        cy.elements().removeClass('highlight prerequisito libera faded');
        cy.elements().addClass('faded');
        node.removeClass('faded').addClass('highlight');
        node.predecessors().removeClass('faded').addClass('prerequisito');
        node.successors().removeClass('faded').addClass('libera');
    });
    cy.on('mouseout', 'node', function(e) {
        cy.elements().removeClass('highlight prerequisito libera faded');
    });
    cy.on('tap', 'node', function(e) {
        alert(`${e.target.data('id')} - ${e.target.data('nomeCompleto')}`);
    });
}