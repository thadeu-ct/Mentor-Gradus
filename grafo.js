document.addEventListener("DOMContentLoaded", () => {
    // Registra a extensão 'dagre' no cytoscape (para layout hierárquico)
    try {
        cytoscape.use(cytoscapeDagre);
    } catch (e) {
        console.warn("Dagre já registrado ou erro ao registrar:", e);
    }

    // Espera os dados do app.js serem carregados (pode precisar de um delay ou evento)
    // Como seu app.js não tem um evento de "DadosProntos", vamos fazer um fetch manual aqui
    // para garantir que funcione isolado por enquanto.
    carregarDadosParaGrafo();
});

async function carregarDadosParaGrafo() {
    try {
        // Carrega o JSON de matérias
        const response = await fetch('/api/dados/materias.json'); // Ou o caminho correto do seu JSON
        // NOTA: Como você está rodando local/vercel, talvez precise ajustar o caminho
        // Se preferir, podemos ler de window.materiasData se você navegar via menu
        
        // MOCK TEMPORÁRIO: Se não conseguir fetch, tente usar o window.materiasData se já existir
        let materias = [];
        
        // Tenta buscar do arquivo físico
        try {
            const resp = await fetch('api/dados/materias.json'); 
            if(resp.ok) materias = await resp.json();
        } catch(e) {
            console.log("Tentando carregar de window.materiasData...");
            if(window.materiasData && window.materiasData.length > 0) {
                materias = window.materiasData;
            } else {
                // Se der tudo errado, só pra testar, coloque um array manual aqui ou avise
                console.error("Não foi possível carregar matérias para o grafo.");
                return;
            }
        }

        inicializarCytoscape(materias);

    } catch (error) {
        console.error("Erro fatal no grafo:", error);
    }
}

function inicializarCytoscape(materias) {
    const elements = [];

    // 1. Criar NÓS (Nodes)
    materias.forEach(mat => {
        elements.push({
            group: 'nodes',
            data: { 
                id: mat.codigo, 
                label: mat.codigo, // Mostra só o código pra não poluir
                nomeCompleto: mat.nome,
                creditos: mat.creditos
            }
        });
    });

    // 2. Criar ARESTAS (Edges) - As setas
    materias.forEach(mat => {
        if (mat.prereqs) {
            mat.prereqs.forEach(grupo => {
                grupo.forEach(prereqCod => {
                    // Se o pré-requisito existe na lista de matérias
                    if (materias.find(m => m.codigo === prereqCod)) {
                        elements.push({
                            group: 'edges',
                            data: { 
                                source: prereqCod, // A seta sai do pré-requisito
                                target: mat.codigo // E aponta para a matéria atual
                            }
                        });
                    }
                });
            });
        }
    });

    // 3. Configurar Visualização
    const cy = cytoscape({
        container: document.getElementById('cy'),
        elements: elements,

        style: [ // O CSS do Grafo
            {
                selector: 'node',
                style: {
                    'background-color': '#3498db',
                    'label': 'data(id)',
                    'color': '#333',
                    'font-size': '10px',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'width': '50px',
                    'height': '50px',
                    'border-width': 2,
                    'border-color': '#fff'
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'line-color': '#ccc',
                    'target-arrow-color': '#ccc',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier'
                }
            },
            // Estilos de Interação (Hover)
            {
                selector: '.highlight', // Matéria focada
                style: {
                    'background-color': '#f1c40f',
                    'line-color': '#f1c40f',
                    'target-arrow-color': '#f1c40f',
                    'transition-property': 'background-color, line-color, target-arrow-color',
                    'transition-duration': '0.5s'
                }
            },
            {
                selector: '.prerequisito', // É pré-requisito da focada (Vermelho)
                style: {
                    'background-color': '#e74c3c',
                    'line-color': '#e74c3c',
                    'target-arrow-color': '#e74c3c',
                    'width': 4
                }
            },
            {
                selector: '.libera', // É liberada pela focada (Verde)
                style: {
                    'background-color': '#27ae60',
                    'line-color': '#27ae60',
                    'target-arrow-color': '#27ae60',
                    'width': 4
                }
            },
            {
                selector: '.faded', // Todo o resto (Blur/Apagado)
                style: {
                    'opacity': 0.1,
                    'label': ''
                }
            }
        ],

        layout: {
            name: 'dagre', // Layout hierárquico
            rankDir: 'LR', // Left to Right (pode mudar para 'TB' - Top to Bottom)
            nodeSep: 50,
            rankSep: 100
        }
    });

    // 4. Lógica de Mouse Over (A parte inovadora)
    cy.on('mouseover', 'node', function(e) {
        const node = e.target;
        
        // Remove classes antigas
        cy.elements().removeClass('highlight prerequisito libera faded');

        // Adiciona 'faded' em TUDO primeiro
        cy.elements().addClass('faded');

        // Remove 'faded' do nó atual e adiciona highlight
        node.removeClass('faded').addClass('highlight');

        // Pega os antecessores (Pré-requisitos)
        const antecessores = node.predecessors();
        antecessores.removeClass('faded').addClass('prerequisito');

        // Pega os sucessores (Matérias que ela libera)
        const sucessores = node.successors();
        sucessores.removeClass('faded').addClass('libera');
    });

    // Reset ao tirar o mouse
    cy.on('mouseout', 'node', function(e) {
        cy.elements().removeClass('highlight prerequisito libera faded');
    });
    
    // Clique para ver detalhes (opcional)
    cy.on('tap', 'node', function(e){
        const nome = e.target.data('nomeCompleto');
        alert("Matéria: " + nome);
    });
}