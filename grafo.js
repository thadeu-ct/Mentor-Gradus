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
    // Quando você clicar num chip na sidebar, ele chama ISSO aqui em vez de ir no backend do planner.
    window.processarEstadoDoBackend = function() {
        console.log("Grafo: Seleção alterada, redesenhando...");
        atualizarGrafo();
    };

    // 3. FORÇA O CARREGAMENTO DOS DADOS (Já que o app.js não faz isso sozinho nessa página)
    try {
        // Verifica se as funções do app.js existem (ele deve ter sido carregado antes no HTML)
        if (typeof window.carregarDadosIniciais === 'function') {
            await window.carregarDadosIniciais(); // Baixa formacoes.json e dominios.json
            
            // Inicializa a lógica de clicar nos chips (Sidebar)
            if (typeof window.initializeChipSelectors === 'function') {
                window.initializeChipSelectors();
            }
            
            // Inicializa o botão de esconder sidebar
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

        // 5. Conecta o botão da sidebar para redimensionar o grafo
        const toggleBtn = document.getElementById("toggle-sidebar-btn");
        const cyDiv = document.getElementById("cy");
        if (toggleBtn && cyDiv) {
            toggleBtn.addEventListener("click", () => {
                cyDiv.classList.toggle("recolhido");
                // Espera a animação do CSS terminar para recalcular o tamanho do grafo
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
    // Captura múltiplos domínios (retorna um NodeList, convertemos para Array)
    const dominiosChips = Array.from(document.querySelectorAll("#dominios-selection .chip-selected"));

    // Se não tem curso base, limpa e sai
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

    // C) Adiciona Obrigatórias dos Domínios [NOVO!]
    nomesDominios.forEach(dominio => {
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
    // Cria um Set para busca rápida de quais matérias existem no grafo atual
    const materiasSet = new Set(materias.map(m => m.codigo));

    // --- CRIAÇÃO DOS NÓS ---
    materias.forEach(mat => {
        elements.push({
            group: 'nodes',
            data: {
                id: mat.codigo,
                label: mat.codigo,
                nomeCompleto: mat.nome // Salva o nome para o alert/tooltip
            }
        });
    });

    // --- CRIAÇÃO DAS ARESTAS (Conexões) ---
    materias.forEach(mat => {
        if (mat.prereqs) {
            mat.prereqs.forEach(grupo => {
                grupo.forEach(prereqCod => {
                    // Só cria a seta se O PRÉ-REQUISITO TAMBÉM ESTIVER no grafo visível.
                    // Isso evita setas apontando para o nada.
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

    // --- INICIALIZAÇÃO DO CYTOSCAPE ---
    const container = document.getElementById('cy');

    if (window.cyInstance) {
        // Se já existe, destrói o anterior para não sobrepor ou bugar layout
        window.cyInstance.destroy();
    }

    window.cyInstance = cytoscape({
        container: container,
        elements: elements,
        
        // --- ESTILOS VISUAIS ---
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
                    'border-color': '#fff',
                    'text-wrap': 'wrap',
                    'text-max-width': '50px'
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
            // --- ESTILOS DE INTERAÇÃO ---
            {
                selector: '.highlight', // A matéria que o mouse está em cima
                style: {
                    'background-color': '#f1c40f', // Amarelo
                    'border-color': '#333',
                    'border-width': 3
                }
            },
            {
                selector: '.prerequisito', // É pré-requisito (Vermelho)
                style: {
                    'background-color': '#e74c3c',
                    'line-color': '#e74c3c',
                    'target-arrow-color': '#e74c3c',
                    'width': 4,
                    'z-index': 999
                }
            },
            {
                selector: '.libera', // É liberada por ela (Verde)
                style: {
                    'background-color': '#27ae60',
                    'line-color': '#27ae60',
                    'target-arrow-color': '#27ae60',
                    'width': 4,
                    'z-index': 999
                }
            },
            {
                selector: '.faded', // Todo o resto (Opacidade baixa)
                style: {
                    'opacity': 0.1
                }
            }
        ],

        // --- LAYOUT AUTOMÁTICO (Dagre) ---
        layout: {
            name: 'dagre',
            rankDir: 'LR', // Left to Right (Esquerda para Direita)
            nodeSep: 30,   // Espaço vertical entre nós
            rankSep: 100,  // Espaço horizontal entre colunas
            padding: 20
        }
    });

    // Ativa os eventos de mouse
    configurarEventosMouse(window.cyInstance);
}

function configurarEventosMouse(cy) {
    cy.on('mouseover', 'node', function(e) {
        const node = e.target;
        
        // 1. Limpa classes antigas e aplica Faded em tudo
        cy.elements().removeClass('highlight prerequisito libera faded');
        cy.elements().addClass('faded');

        // 2. Destaca o nó atual
        node.removeClass('faded').addClass('highlight');

        // 3. Destaca os Antecessores (Recursivo) - Quem libera essa matéria
        // .predecessors() pega toda a cadeia para trás
        node.predecessors().removeClass('faded').addClass('prerequisito');

        // 4. Destaca os Sucessores (Recursivo) - Quem essa matéria libera
        // .successors() pega toda a cadeia para frente
        node.successors().removeClass('faded').addClass('libera');
    });

    cy.on('mouseout', 'node', function(e) {
        // Reseta tudo ao normal
        cy.elements().removeClass('highlight prerequisito libera faded');
    });

    cy.on('tap', 'node', function(e) {
        // Exemplo simples de clique
        alert(`${e.target.data('id')} - ${e.target.data('nomeCompleto')}`);
    });
}