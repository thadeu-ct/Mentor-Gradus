document.addEventListener("DOMContentLoaded", () => {
    try { if (typeof cytoscapeDagre !== 'undefined') cytoscape.use(cytoscapeDagre); } catch (e) { }
    inicializarPaginaGrafo();
});

async function inicializarPaginaGrafo() {
    console.log("Grafo: Iniciando configuração...");
    window.processarEstadoDoBackend = function() { atualizarGrafo(); };

    try {
        if (typeof window.carregarDadosIniciais === 'function') {
            await window.carregarDadosIniciais();
            if (typeof window.initializeChipSelectors === 'function') window.initializeChipSelectors();
            if (typeof window.initializeSidebar === 'function') window.initializeSidebar();
        }

        if (!window.materiasData || window.materiasData.length === 0) {
            const resp = await fetch('/api/get-todas-materias');
            window.materiasData = await resp.json();
        }

        const toggleBtn = document.getElementById("toggle-sidebar-btn");
        const cyDiv = document.getElementById("cy");
        if (toggleBtn && cyDiv) {
            toggleBtn.addEventListener("click", () => {
                cyDiv.classList.toggle("recolhido");
                setTimeout(() => { if (window.cyInstance) window.cyInstance.resize(); }, 350);
            });
        }
    } catch (error) { console.error("Erro fatal:", error); }
}

function atualizarGrafo() {
    // 1. Captura MÚLTIPLOS Chips de Formação
    const formacoesChips = Array.from(document.querySelectorAll("#formacoes-selection .chip-selected"));
    const enfaseChip = document.querySelector("#enfase-selection .chip-selected");
    const dominiosChips = Array.from(document.querySelectorAll("#dominios-selection .chip-selected"));

    // Se não tem NENHUM curso selecionado, limpa o grafo e sai
    if (formacoesChips.length === 0) {
        if (window.cyInstance) window.cyInstance.elements().remove();
        return;
    }

    const nomeEnfase = enfaseChip ? enfaseChip.dataset.value : null;
    const nomesDominios = dominiosChips.map(chip => chip.dataset.value);

    // 2. Coletar lista de códigos para exibir (Set evita duplicatas)
    let codigosParaExibir = new Set();

    // Função auxiliar para adicionar arrays ao Set sem repetir
    const adicionarSeExistir = (lista) => {
        if (lista) lista.forEach(c => codigosParaExibir.add(c));
    };

    // A) LOOP POR TODAS AS FORMAÇÕES SELECIONADAS (Correção Principal)
    formacoesChips.forEach(chip => {
        const nomeCurso = chip.dataset.value;
        const dadosCurso = window.dadosFormacoes[nomeCurso];

        if (dadosCurso) {
            console.log(`Adicionando curso: ${nomeCurso}`);
            
            // 1. Adiciona Obrigatórias do Tronco
            adicionarSeExistir(dadosCurso.obrigatórias);

            // 2. Verifica se a Ênfase selecionada pertence a ESTE curso
            // (Ex: Se escolheu "Eng. Elétrica" + "Eng. Computação", e a ênfase é "Sistemas de Potência",
            // ela só vai adicionar as matérias quando o loop estiver passando pela Elétrica)
            if (nomeEnfase && dadosCurso.enfase && dadosCurso.enfase[nomeEnfase]) {
                console.log(`  -> Aplicando ênfase ${nomeEnfase} em ${nomeCurso}`);
                adicionarSeExistir(dadosCurso.enfase[nomeEnfase].obrigatórias);
            }
        }
    });

    // B) Adiciona Obrigatórias dos Domínios
    nomesDominios.forEach(dominio => {
        const dadosDominio = window.dadosDominios[dominio];
        if (dadosDominio) {
            console.log(`Adicionando domínio: ${dominio}`);
            adicionarSeExistir(dadosDominio.obrigatórias);
        }
    });

    // 3. Filtrar o array global de matérias
    const materiasFiltradas = window.materiasData.filter(m => codigosParaExibir.has(m.codigo));

    console.log(`Grafo: Desenhando ${materiasFiltradas.length} nós combinados.`);

    // 4. Desenhar
    desenharCytoscape(materiasFiltradas);
}

function desenharCytoscape(materias) {
    const container = document.getElementById('cy');
    const elements = [];
    const materiasSet = new Set(materias.map(m => m.codigo));

    // --- CRIAÇÃO DOS NÓS (Com Quebra de Linha no Nome) ---
    materias.forEach(mat => {
        // Truque para quebrar linha no nome (máx 15 chars por linha)
        const labelNome = mat.nome.replace(/(.{15}\w*)\s/g, "$1\n");
        
        elements.push({
            group: 'nodes',
            data: { 
                id: mat.codigo, 
                // Mostra Código em cima e Nome embaixo
                label: `${mat.codigo}\n${labelNome}`,
                nomeCompleto: mat.nome
            }
        });
    });

    // --- CRIAÇÃO DAS ARESTAS ---
    materias.forEach(mat => {
        if (mat.prereqs) {
            mat.prereqs.forEach(grupo => {
                grupo.forEach(prereqCod => {
                    if (materiasSet.has(prereqCod)) {
                        elements.push({
                            group: 'edges',
                            data: { 
                                id: `edge_${prereqCod}_to_${mat.codigo}`,
                                source: prereqCod, 
                                target: mat.codigo 
                            }
                        });
                    }
                });
            });
        }
    });

    // --- CONFIGURAÇÃO VISUAL (Retângulos Grandes) ---
    const estilo = [
        {
            selector: 'node',
            style: {
                'shape': 'round-rectangle', // Retângulo arredondado
                'background-color': '#ffffff',
                'border-width': 2,
                'border-color': '#34495e',
                'label': 'data(label)',
                'color': '#2c3e50',
                'font-size': '12px', // Fonte maior
                'font-weight': '600',
                'text-valign': 'center',
                'text-halign': 'center',
                'text-wrap': 'wrap', // Permite quebra de linha
                'text-max-width': '140px',
                'width': '160px',  // Largura fixa boa para leitura
                'height': '60px',  // Altura fixa
                'padding': '10px'
            }
        },
        {
            selector: 'edge',
            style: {
                'width': 2,
                'line-color': '#95a5a6',
                'target-arrow-color': '#95a5a6',
                'target-arrow-shape': 'triangle',
                'curve-style': 'bezier', // Curva suave (bezier) ou 'taxi' (linhas retas)
                'arrow-scale': 1.5
            }
        },
        // INTERAÇÃO
        {
            selector: '.highlight', // Nó Focado
            style: {
                'background-color': '#fff3e0',
                'border-color': '#f39c12',
                'border-width': 3,
                'color': '#d35400'
            }
        },
        {
            selector: '.prerequisito', // É pai (Vermelho)
            style: {
                'background-color': '#ffebee',
                'border-color': '#c0392b',
                'line-color': '#c0392b',
                'target-arrow-color': '#c0392b',
                'width': 4,
                'z-index': 999
            }
        },
        {
            selector: '.libera', // É filho (Verde)
            style: {
                'background-color': '#e8f8f5',
                'border-color': '#27ae60',
                'line-color': '#27ae60',
                'target-arrow-color': '#27ae60',
                'width': 4,
                'z-index': 999
            }
        },
        {
            selector: '.faded',
            style: { 'opacity': 0.15 } // Um pouco mais visível que 0.1
        }
    ];

    // --- LAYOUT HIERÁRQUICO (Árvore Top-Down) ---
    const layoutConfig = {
        name: 'dagre',
        rankDir: 'TB', // Top to Bottom (De cima para baixo!)
        nodeSep: 60,   // Espaço horizontal entre nós
        rankSep: 100,  // Espaço vertical (níveis)
        padding: 30,
        animate: true,
        animationDuration: 500
    };

    if (window.cyInstance) {
        window.cyInstance.json({ elements: elements });
        window.cyInstance.layout(layoutConfig).run();
    } else {
        window.cyInstance = cytoscape({
            container: container,
            elements: elements,
            style: estilo,
            layout: layoutConfig,
            minZoom: 0.2, // Evita zoom out infinito
            maxZoom: 2,   // Evita zoom in excessivo
            wheelSensitivity: 0.2 // Scroll mais suave
        });
        configurarEventosMouse(window.cyInstance);
    }
}

function configurarEventosMouse(cy) {
    cy.on('mouseover', 'node', function(e) {
        const node = e.target;
        cy.elements().removeClass('highlight prerequisito libera faded');
        cy.elements().addClass('faded');
        
        node.removeClass('faded').addClass('highlight');
        
        // Caminho reverso (O que eu preciso ter feito)
        node.predecessors().removeClass('faded').addClass('prerequisito');
        
        // Caminho direto (O que eu libero)
        node.successors().removeClass('faded').addClass('libera');
    });

    cy.on('mouseout', 'node', function(e) {
        cy.elements().removeClass('highlight prerequisito libera faded');
    });
}