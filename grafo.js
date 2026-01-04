// =========================================================
//  MENTOR GRADUS - GRAFO.JS
// =========================================================

document.addEventListener("DOMContentLoaded", () => {
    // Carrega extensões do Cytoscape se disponíveis
    try { 
        if (typeof cytoscapeDagre !== 'undefined') cytoscape.use(cytoscapeDagre); 
    } catch (e) { console.log("Aviso: Dagre já carregado ou erro ao carregar."); }
    
    // Conecta a lógica do Grafo ao Sistema Principal
    // Quando o app.js processar algo (ex: mudar chip), ele chamará atualizarGrafo()
    window.processarEstadoDoBackend = function() { 
        atualizarGrafo(); 
    };

    // Configura botão de toggle da sidebar específico do grafo
    const toggleBtn = document.getElementById("toggle-sidebar-btn");
    const cyDiv = document.getElementById("cy");
    if (toggleBtn && cyDiv) {
        toggleBtn.addEventListener("click", () => {
            cyDiv.classList.toggle("recolhido");
            // Redimensiona o grafo após a animação da sidebar
            setTimeout(() => { 
                if (window.cyInstance) window.cyInstance.resize(); 
            }, 350);
        });
    }
});

// Função Principal: Lê o que está selecionado na sidebar e desenha
function atualizarGrafo() {
    // 1. Captura Chips da Sidebar
    const formacoesChips = Array.from(document.querySelectorAll("#formacoes-selection .chip-selected"));
    const enfaseChip = document.querySelector("#enfase-selection .chip-selected");
    const dominiosChips = Array.from(document.querySelectorAll("#dominios-selection .chip-selected"));

    // Se não tem nada selecionado, limpa o grafo
    if (formacoesChips.length === 0) {
        if (window.cyInstance) window.cyInstance.elements().remove();
        return;
    }

    const nomeEnfase = enfaseChip ? enfaseChip.dataset.value : null;
    const nomesDominios = dominiosChips.map(chip => chip.dataset.value);

    // 2. Coletar lista de códigos (Set evita duplicatas)
    let codigosParaExibir = new Set();
    const adicionarSeExistir = (lista) => {
        if (lista) lista.forEach(c => codigosParaExibir.add(c));
    };

    // A) Formações
    formacoesChips.forEach(chip => {
        const nomeCurso = chip.dataset.value;
        const dadosCurso = window.dadosFormacoes[nomeCurso];

        if (dadosCurso) {
            // Tronco Obrigatório
            adicionarSeExistir(dadosCurso.obrigatórias);
            
            // Ênfase (se pertencer a este curso)
            if (nomeEnfase && dadosCurso.enfase && dadosCurso.enfase[nomeEnfase]) {
                adicionarSeExistir(dadosCurso.enfase[nomeEnfase].obrigatórias);
            }
        }
    });

    // B) Domínios
    nomesDominios.forEach(dominio => {
        const dadosDominio = window.dadosDominios[dominio];
        if (dadosDominio) {
            adicionarSeExistir(dadosDominio.obrigatórias);
        }
    });

    // 3. Filtra os dados completos das matérias
    // (Garante que só desenhamos o que temos dados carregados)
    const materiasFiltradas = window.dadosMaterias.filter(m => codigosParaExibir.has(m.codigo));

    // 4. Desenha
    desenharCytoscape(materiasFiltradas);
}

function desenharCytoscape(materias) {
    const container = document.getElementById('cy');
    if (!container) return;

    const elements = [];
    const materiasSet = new Set(materias.map(m => m.codigo));

    // Nós
    materias.forEach(mat => {
        const labelNome = mat.nome.replace(/(.{15}\w*)\s/g, "$1\n"); // Quebra linha
        elements.push({
            group: 'nodes',
            data: { 
                id: mat.codigo, 
                label: `${mat.codigo}\n${labelNome}`
            }
        });
    });

    // Arestas (Pré-requisitos)
    materias.forEach(mat => {
        if (mat.prereqs) {
            mat.prereqs.forEach(grupo => {
                grupo.forEach(prereqCod => {
                    // Só desenha aresta se ambos os nós existirem no grafo atual
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

    // Configuração Visual
    const estilo = [
        {
            selector: 'node',
            style: {
                'shape': 'round-rectangle',
                'background-color': '#ffffff',
                'border-width': 2,
                'border-color': '#34495e',
                'label': 'data(label)',
                'color': '#2c3e50',
                'font-size': '12px',
                'font-weight': '600',
                'text-valign': 'center',
                'text-halign': 'center',
                'text-wrap': 'wrap',
                'width': '160px',
                'height': '60px',
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
                'curve-style': 'bezier',
                'arrow-scale': 1.5
            }
        },
        {
            selector: '.highlight', // Foco no nó
            style: {
                'background-color': '#fff3e0',
                'border-color': '#f39c12',
                'border-width': 3,
                'color': '#d35400'
            }
        },
        {
            selector: '.prerequisito', // Pai (Vermelho)
            style: {
                'background-color': '#ffebee',
                'border-color': '#c0392b',
                'line-color': '#c0392b',
                'target-arrow-color': '#c0392b',
                'width': 3
            }
        },
        {
            selector: '.libera', // Filho (Verde)
            style: {
                'background-color': '#e8f8f5',
                'border-color': '#27ae60',
                'line-color': '#27ae60',
                'target-arrow-color': '#27ae60',
                'width': 3
            }
        },
        {
            selector: '.faded',
            style: { 'opacity': 0.1 }
        }
    ];

    const layoutConfig = {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 60,
        rankSep: 100,
        padding: 30,
        animate: true,
        animationDuration: 500
    };

    // Inicializa ou Atualiza
    if (window.cyInstance) {
        window.cyInstance.json({ elements: elements });
        window.cyInstance.layout(layoutConfig).run();
    } else {
        window.cyInstance = cytoscape({
            container: container,
            elements: elements,
            style: estilo,
            layout: layoutConfig,
            minZoom: 0.2,
            maxZoom: 2,
            wheelSensitivity: 0.2
        });
        
        // Eventos de Mouse (Highlight)
        window.cyInstance.on('mouseover', 'node', function(e) {
            const node = e.target;
            const cy = window.cyInstance;
            
            cy.elements().removeClass('highlight prerequisito libera faded');
            cy.elements().addClass('faded');
            
            node.removeClass('faded').addClass('highlight');
            node.predecessors().removeClass('faded').addClass('prerequisito');
            node.successors().removeClass('faded').addClass('libera');
        });

        window.cyInstance.on('mouseout', 'node', function(e) {
             const cy = window.cyInstance;
             cy.elements().removeClass('highlight prerequisito libera faded');
        });
    }
}