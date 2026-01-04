// =========================================================
//  MENTOR GRADUS - GRAFO.JS (Versão Blindada 🛡️)
// =========================================================

document.addEventListener("DOMContentLoaded", () => {
    // Tenta carregar extensões do Cytoscape se disponíveis
    try { 
        if (typeof cytoscapeDagre !== 'undefined') {
            cytoscape.use(cytoscapeDagre);
            console.log("✅ Extensão Dagre carregada com sucesso.");
        } else {
            console.warn("⚠️ Extensão Dagre não encontrada. Usando layout padrão.");
        }
    } catch (e) { 
        console.warn("Aviso: Erro ao registrar Dagre (pode já estar carregado).", e); 
    }
    
    // Conecta a lógica do Grafo ao Sistema Principal
    window.processarEstadoDoBackend = function() { 
        atualizarGrafo(); 
    };

    // Configura botão de toggle da sidebar
    const toggleBtn = document.getElementById("toggle-sidebar-btn");
    const cyDiv = document.getElementById("cy");
    if (toggleBtn && cyDiv) {
        toggleBtn.addEventListener("click", () => {
            cyDiv.classList.toggle("recolhido");
            setTimeout(() => { 
                if (window.cyInstance) {
                    window.cyInstance.resize(); 
                    window.cyInstance.fit();
                }
            }, 350);
        });
    }
});

// Função Principal
function atualizarGrafo() {
    console.log("🔄 Atualizando Grafo...");

    // 1. Captura Chips da Sidebar
    const formacoesChips = Array.from(document.querySelectorAll("#formacoes-selection .chip-selected"));
    const enfaseChip = document.querySelector("#enfase-selection .chip-selected");
    const dominiosChips = Array.from(document.querySelectorAll("#dominios-selection .chip-selected"));

    // SE NÃO TIVER NADA SELECIONADO, LIMPA O GRAFO
    if (formacoesChips.length === 0) {
        console.log("ℹ️ Nenhuma formação selecionada. Grafo limpo.");
        if (window.cyInstance) window.cyInstance.elements().remove();
        // Opcional: Mostrar aviso na tela
        const container = document.getElementById('cy');
        if(container) container.innerHTML = '<div style="display:flex; height:100%; align-items:center; justify-content:center; color:#777;">Selecione uma Formação na barra lateral para visualizar o grafo.</div>';
        return;
    }

    const nomeEnfase = enfaseChip ? enfaseChip.dataset.value : null;
    const nomesDominios = dominiosChips.map(chip => chip.dataset.value);

    // 2. Coletar lista de códigos
    let codigosParaExibir = new Set();
    const adicionarSeExistir = (lista) => {
        if (lista) lista.forEach(c => codigosParaExibir.add(c));
    };

    // A) Formações
    formacoesChips.forEach(chip => {
        const nomeCurso = chip.dataset.value;
        const dadosCurso = window.dadosFormacoes[nomeCurso];

        if (dadosCurso) {
            adicionarSeExistir(dadosCurso.obrigatórias);
            if (nomeEnfase && dadosCurso.enfase && dadosCurso.enfase[nomeEnfase]) {
                adicionarSeExistir(dadosCurso.enfase[nomeEnfase].obrigatórias);
            }
        } else {
            console.error(`❌ Dados da formação '${nomeCurso}' não encontrados! Verifique o JSON.`);
        }
    });

    // B) Domínios
    nomesDominios.forEach(dominio => {
        const dadosDominio = window.dadosDominios[dominio];
        if (dadosDominio) adicionarSeExistir(dadosDominio.obrigatórias);
    });

    // 3. Filtra os dados globais
    if (!window.dadosMaterias || window.dadosMaterias.length === 0) {
        console.error("❌ Erro Crítico: window.dadosMaterias está vazio.");
        return;
    }

    const materiasFiltradas = window.dadosMaterias.filter(m => codigosParaExibir.has(m.codigo));
    console.log(`📊 Matérias filtradas: ${materiasFiltradas.length} nós a desenhar.`);

    // 4. Desenha
    desenharCytoscape(materiasFiltradas);
}

function desenharCytoscape(materias) {
    const container = document.getElementById('cy');
    if (!container) return;

    // Remove mensagem de aviso se existir
    if(container.innerText.includes("Selecione uma Formação")) container.innerHTML = '';

    const elements = [];
    const materiasSet = new Set(materias.map(m => m.codigo));

    // Nós
    materias.forEach(mat => {
        const labelNome = mat.nome.replace(/(.{15}\w*)\s/g, "$1\n");
        elements.push({
            group: 'nodes',
            data: { id: mat.codigo, label: `${mat.codigo}\n${labelNome}` }
        });
    });

    // Arestas
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

    // Configura layout com fallback
    let layoutName = 'dagre';
    if (typeof cytoscapeDagre === 'undefined') {
        layoutName = 'breadthfirst'; // Fallback se o dagre falhar
        console.warn("⚠️ Usando layout 'breadthfirst' pois o Dagre não carregou.");
    }

    const layoutConfig = {
        name: layoutName,
        rankDir: 'TB',
        nodeSep: 60,
        rankSep: 100,
        padding: 30,
        animate: true,
        animationDuration: 500
    };

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
        { selector: '.highlight', style: { 'background-color': '#fff3e0', 'border-color': '#f39c12', 'border-width': 3, 'color': '#d35400' } },
        { selector: '.prerequisito', style: { 'background-color': '#ffebee', 'border-color': '#c0392b', 'line-color': '#c0392b', 'target-arrow-color': '#c0392b', 'width': 3 } },
        { selector: '.libera', style: { 'background-color': '#e8f8f5', 'border-color': '#27ae60', 'line-color': '#27ae60', 'target-arrow-color': '#27ae60', 'width': 3 } },
        { selector: '.faded', style: { 'opacity': 0.1 } }
    ];

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

        // Eventos de Mouse
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
             window.cyInstance.elements().removeClass('highlight prerequisito libera faded');
        });
    }
}