document.addEventListener("DOMContentLoaded", () => {
    // 1. Registra a extensão dagre (layout hierárquico)
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

    // Hook: Sobrescreve a função do app.js. 
    window.processarEstadoDoBackend = function() {
        console.log("Grafo: Seleção alterada, redesenhando...");
        atualizarGrafo();
    };

    // 3. FORÇA O CARREGAMENTO DOS DADOS
    try {
        if (typeof window.carregarDadosIniciais === 'function') {
            await window.carregarDadosIniciais(); // Baixa formacoes.json e dominios.json
            
            if (typeof window.initializeChipSelectors === 'function') {
                window.initializeChipSelectors();
            }
            if (typeof window.initializeSidebar === 'function') {
                window.initializeSidebar();
            }
        } else {
            console.error("Erro: app.js não foi carregado corretamente.");
        }

        // 4. Garante que temos a lista de matérias
        if (!window.materiasData || window.materiasData.length === 0) {
            console.log("Grafo: Baixando matérias manualmente...");
            const resp = await fetch('api/dados/materias.json');
            window.materiasData = await resp.json();
        }

        // 5. Conecta o botão da sidebar
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
    // 1. Captura os Chips Selecionados (Curso, Ênfase e Domínios)
    const formacaoChip = document.querySelector("#formacoes-selection .chip-selected");
    const enfaseChip = document.querySelector("#enfase-selection .chip-selected");
    // [NOVO] Captura múltiplos domínios
    const dominiosChips = Array.from(document.querySelectorAll("#dominios-selection .chip-selected"));

    // Se não tem curso selecionado, limpa o grafo e sai
    if (!formacaoChip) {
        if (window.cyInstance) window.cyInstance.elements().remove();
        return;
    }

    const nomeCurso = formacaoChip.dataset.value;
    const nomeEnfase = enfaseChip ? enfaseChip.dataset.value : null;
    const nomesDominios = dominiosChips.map(chip => chip.dataset.value);

    console.log(`Grafo: Curso [${nomeCurso}] | Ênfase [${nomeEnfase}] | Domínios [${nomesDominios.join(', ')}]`);

    // 2. Coletar lista de códigos para exibir (Set evita duplicatas)
    let codigosParaExibir = new Set();

    // A) Adiciona Obrigatórias do Curso Base
    const dadosCurso = window.dadosFormacoes[nomeCurso];
    if (dadosCurso && dadosCurso.obrigatórias) {
        dadosCurso.obrigatórias.forEach(c => codigosParaExibir.add(c));
    }

    // B) Adiciona Obrigatórias da Ênfase
    if (nomeEnfase && dadosCurso.enfase && dadosCurso.enfase[nomeEnfase]) {
        const dadosEnfase = dadosCurso.enfase[nomeEnfase];
        if (dadosEnfase.obrigatórias) {
            dadosEnfase.obrigatórias.forEach(c => codigosParaExibir.add(c));
        }
    }

    // C) [NOVO] Adiciona Obrigatórias dos Domínios
    nomesDominios.forEach(dominio => {
        // Acessa a variável global window.dadosDominios (carregada pelo app.js)
        const dadosDominio = window.dadosDominios[dominio];
        if (dadosDominio && dadosDominio.obrigatórias) {
            dadosDominio.obrigatórias.forEach(c => codigosParaExibir.add(c));
        }
    });

    // 3. Filtrar o array global de matérias
    // (Pega apenas as matérias cujo código está no nosso Set de exibição)
    const materiasFiltradas = window.materiasData.filter(m => codigosParaExibir.has(m.codigo));

    // 4. Desenhar
    desenharCytoscape(materiasFiltradas);
}

function desenharCytoscape(materias) {
    const elements = [];
    const materiasSet = new Set(materias.map(m => m.codigo));

    // --- CRIAÇÃO DOS NÓS ---
    materias.forEach(mat => {
        elements.push({
            group: 'nodes',
            data: {
                id: mat.codigo,
                label: mat.codigo,
                nomeCompleto: mat.nome
            }
        });
    });

    // --- CRIAÇÃO DAS ARESTAS ---
    materias.forEach(mat => {
        if (mat.prereqs) {
            mat.prereqs.forEach(grupo => {
                grupo.forEach(prereqCod => {
                    // Só desenha a seta se a origem e o destino estiverem na tela
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

    // --- RENDERIZAÇÃO ---
    const container = document.getElementById('cy');

    if (window.cyInstance) {
        window.cyInstance.destroy(); // Limpa anterior
    }

    window.cyInstance = cytoscape({
        container: container,
        elements: elements,
        style: [
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
                    'width': '55px',
                    'height': '55px',
                    'border-width': 2,
                    'border-color': '#fff'
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'line-color': '#bdc3c7',
                    'target-arrow-color': '#bdc3c7',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'arrow-scale': 1.2
                }
            },
            // Classes de interação (Hover)
            {
                selector: '.highlight',
                style: { 'background-color': '#f1c40f', 'border-color': '#333', 'border-width': 3 }
            },
            {
                selector: '.prerequisito',
                style: { 'background-color': '#e74c3c', 'line-color': '#e74c3c', 'target-arrow-color': '#e74c3c', 'width': 4, 'z-index': 999 }
            },
            {
                selector: '.libera',
                style: { 'background-color': '#27ae60', 'line-color': '#27ae60', 'target-arrow-color': '#27ae60', 'width': 4, 'z-index': 999 }
            },
            {
                selector: '.faded',
                style: { 'opacity': 0.1 }
            }
        ],
        layout: {
            name: 'dagre',
            rankDir: 'LR',
            nodeSep: 30,
            rankSep: 100,
            padding: 20
        }
    });

    configurarEventosMouse(window.cyInstance);
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