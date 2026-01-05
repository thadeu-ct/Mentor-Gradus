// =========================================================
//  MENTOR GRADUS - GRAFO.JS (Versão Compacta / Grid 🧱)
// =========================================================

const substituicoesOptativas = {};

// --- BLOCO DE SEGURANÇA ---
window.salvarBoardLocal = function() { console.log("🔒 Salvar bloqueado no Grafo."); };
window.adicionarColunaPeriodo = function() { console.log("🔒 Adicionar Coluna bloqueado."); };

window.carregarBoardLocal = function() {
    const salvo = localStorage.getItem('mentorGradus_Estado');
    if (!salvo) return;
    const dados = JSON.parse(salvo);

    const restaurar = (sel, drop, lista) => {
        const area = document.querySelector(sel);
        const dropdown = document.querySelector(drop);
        if(!area) return;
        area.innerHTML = '';
        if (!lista) return;
        lista.forEach(val => {
            const span = document.createElement('span');
            span.className = 'chip-selected';
            span.dataset.value = val;
            const texto = val.startsWith("Engenharia de ") ? "Eng. " + val.substring(14) : val;
            span.innerHTML = `${texto} <i class="fas fa-times"></i>`;
            area.appendChild(span);
            if (dropdown) {
                const op = dropdown.querySelector(`.chip[data-value="${val}"]`);
                if (op) op.classList.add('disabled');
            }
        });
    };

    restaurar("#formacoes-selection", "#formacoes-options", dados.selecoes.formacoes);
    restaurar("#dominios-selection", "#dominios-options", dados.selecoes.dominios);
    
    if (typeof window.atualizarEnfasesDisponiveis === 'function') window.atualizarEnfasesDisponiveis();

    if (dados.selecoes.enfase) {
        const area = document.querySelector("#enfase-selection");
        const drop = document.querySelector("#enfase-options");
        if(area && drop && drop.querySelector(`.chip[data-value="${dados.selecoes.enfase}"]`)) {
            const span = document.createElement('span');
            span.className = 'chip-selected';
            span.dataset.value = dados.selecoes.enfase;
            span.innerHTML = `${dados.selecoes.enfase} <i class="fas fa-times"></i>`;
            area.innerHTML = '';
            area.appendChild(span);
        }
    }
    setTimeout(atualizarGrafoLogica, 500);
};

window.selecionarMateriaDoModal = function(materia) {
    const codigoGrupo = window.grupoSendoEditado;
    if (codigoGrupo) {
        substituicoesOptativas[codigoGrupo] = materia;
        document.getElementById('modal-selecao').classList.add('escondido');
        document.getElementById('modal-backdrop').classList.add('escondido');
        atualizarGrafoLogica();
    }
};

window.processarEstadoDoBackend = function() {
    if (typeof window.atualizarEnfasesDisponiveis === 'function') window.atualizarEnfasesDisponiveis();
    atualizarGrafoLogica();
};

// --- INICIALIZAÇÃO ---
document.addEventListener("DOMContentLoaded", () => {
    try { 
        if (typeof cytoscapeDagre !== 'undefined') cytoscape.use(cytoscapeDagre); 
    } catch (e) { console.log("Aviso: Layout Dagre já registrado."); }
    
    window.atualizarGrafo = atualizarGrafoLogica;

    const toggleBtn = document.getElementById("toggle-sidebar-btn");
    const cyDiv = document.getElementById("cy");
    if (toggleBtn && cyDiv) {
        toggleBtn.addEventListener("click", () => {
            cyDiv.classList.toggle("recolhido");
            setTimeout(() => { 
                if (window.cyInstance) { 
                    window.cyInstance.resize(); 
                    window.cyInstance.fit(); // Ajusta zoom ao abrir/fechar sidebar
                } 
            }, 350);
        });
    }
});

function atualizarGrafoLogica() {
    const container = document.getElementById('cy');
    const formacoesChips = Array.from(document.querySelectorAll("#formacoes-selection .chip-selected"));
    
    if (formacoesChips.length === 0) {
        if (window.cyInstance) { window.cyInstance.destroy(); window.cyInstance = null; }
        if(container) container.innerHTML = '<div style="display:flex; height:100%; align-items:center; justify-content:center; color:#777; font-size:1.2rem;">Selecione uma Formação na barra lateral.</div>';
        return;
    }
    if (container && container.innerText.includes("Selecione")) container.innerHTML = '';

    let codigosParaExibir = new Set();
    const adicionar = (lista) => { if (lista) lista.forEach(c => codigosParaExibir.add(c)); };

    const enfaseChip = document.querySelector("#enfase-selection .chip-selected");
    const nomeEnfase = enfaseChip ? enfaseChip.dataset.value : null;

    formacoesChips.forEach(chip => {
        const dados = window.dadosFormacoes[chip.dataset.value];
        if (dados) {
            adicionar(dados.obrigatórias);
            if (nomeEnfase && dados.enfase && dados.enfase[nomeEnfase]) adicionar(dados.enfase[nomeEnfase].obrigatórias);
        }
    });

    const elements = [];
    const nosAdicionados = new Set();

    // Função de criação de nós mais compacta
    const criarNo = (codigo, nome, tipo) => {
        if (!codigo || nosAdicionados.has(codigo)) return;
        
        // CORTE DE TEXTO AGRESSIVO: Só mostra o código e início do nome
        let label = codigo; 
        
        // Truque: Nome completo vai no tooltip (data), label fica curto
        elements.push({
            group: 'nodes',
            data: { 
                id: codigo, 
                label: label, 
                fullName: nome, // Guardado para usar depois se precisar
                tipo: tipo 
            }
        });
        nosAdicionados.add(codigo);
    };

    const materiasBase = window.dadosMaterias.filter(m => codigosParaExibir.has(m.codigo));
    materiasBase.forEach(mat => criarNo(mat.codigo, mat.nome, 'normal'));

    materiasBase.forEach(mat => {
        if (mat.prereqs) {
            mat.prereqs.forEach(grupo => {
                grupo.forEach(req => {
                    if (!req) return;
                    const ehGrupo = (req.length === 7 && req.includes('00'));
                    let origem = req;
                    
                    if (ehGrupo && substituicoesOptativas[req]) {
                        const matEscolhida = substituicoesOptativas[req];
                        origem = matEscolhida.codigo;
                        criarNo(matEscolhida.codigo, matEscolhida.nome, 'escolhida');
                        if (matEscolhida.prereqs) {
                            matEscolhida.prereqs.forEach(g => g.forEach(p => {
                                criarNo(p, p, 'normal'); 
                                const edgeId = `e_${p}_${origem}`.replace(/\s/g, ''); 
                                elements.push({ group: 'edges', data: { id: edgeId, source: p, target: origem }, classes: 'prerequisito' });
                            }));
                        }
                    } else if (ehGrupo) {
                        const nomeGrupo = window.dadosOptativas[req] ? (window.dadosOptativas[req].nome || "Optativa") : "Grupo";
                        criarNo(req, nomeGrupo, 'optativa');
                    } else {
                        if (!nosAdicionados.has(req)) criarNo(req, req, 'normal');
                    }
                    const edgeId = `e_${origem}_${mat.codigo}`.replace(/\s/g, '');
                    elements.push({ group: 'edges', data: { id: edgeId, source: origem, target: mat.codigo }, classes: 'prerequisito' });
                });
            });
        }
        if (mat.correq) {
            mat.correq.forEach(grupo => {
                grupo.forEach(req => {
                    if (!req) return;
                    if (!nosAdicionados.has(req)) criarNo(req, req, 'normal');
                    const edgeId = `e_cor_${req}_${mat.codigo}`.replace(/\s/g, '');
                    elements.push({ group: 'edges', data: { id: edgeId, source: req, target: mat.codigo }, classes: 'correquisito' });
                });
            });
        }
    });

    desenharCytoscape(elements);
}

function desenharCytoscape(elements) {
    const container = document.getElementById('cy');
    
    // ESTILIZAÇÃO COMPACTA
    const estilo = [
        {
            selector: 'node',
            style: {
                'shape': 'round-rectangle',
                'background-color': 'white',
                'border-width': 1, 
                'border-color': '#7f8c8d',
                'label': 'data(label)',
                'text-valign': 'center', 
                'text-halign': 'center', 
                'text-wrap': 'wrap',
                
                // DIMENSÕES REDUZIDAS (Compactação)
                'width': '90px', 
                'height': '35px', 
                'font-size': '10px', 
                'font-weight': 'bold', 
                'color': '#2c3e50'
            }
        },
        {
            selector: 'node[tipo="optativa"]',
            style: {
                'background-color': '#fff3e0',
                'border-color': '#e67e22',
                'color': '#d35400',
                'border-style': 'dashed'
            }
        },
        {
            selector: 'edge',
            style: {
                'width': 1, // Linha mais fina
                'curve-style': 'bezier',
                'arrow-scale': 0.8
            }
        },
        {
            selector: 'edge.prerequisito',
            style: { 'line-color': '#95a5a6', 'target-arrow-color': '#95a5a6', 'target-arrow-shape': 'triangle' }
        },
        {
            selector: 'edge.correquisito',
            style: { 'line-color': '#bdc3c7', 'target-arrow-color': '#bdc3c7', 'target-arrow-shape': 'circle', 'line-style': 'dashed' }
        },
        // Highlight states
        { selector: '.highlight', style: { 'background-color': '#d6eaf8', 'border-color': '#3498db', 'border-width': 2 } },
        { selector: '.prerequisito-path', style: { 'line-color': '#e74c3c', 'target-arrow-color': '#e74c3c', 'width': 2 } },
        { selector: '.libera-path', style: { 'line-color': '#27ae60', 'target-arrow-color': '#27ae60', 'width': 2 } },
        { selector: '.faded', style: { 'opacity': 0.05 } } // Esconde quase tudo que não importa
    ];

    // LAYOUT APERTADO
    const layoutConfig = { 
        name: 'dagre', 
        rankDir: 'TB', 
        
        // A MÁGICA DA COMPACTAÇÃO:
        nodeSep: 15,    // Espaço horizontal mínimo entre cartões
        rankSep: 40,    // Espaço vertical entre níveis (gerações)
        edgeSep: 10,    // Espaço entre linhas
        
        padding: 20,
        animate: false  // Desliga animação inicial para carregar rápido na posição certa
    };

    if (window.cyInstance) {
        window.cyInstance.json({ elements: elements });
        window.cyInstance.layout(layoutConfig).run();
        // Força ajuste de tela após redesenhar
        window.cyInstance.fit(elements, 30); 
    } else {
        window.cyInstance = cytoscape({
            container: container,
            elements: elements,
            style: estilo,
            layout: layoutConfig,
            minZoom: 0.1, 
            maxZoom: 3, 
            wheelSensitivity: 0.2
        });
        
        // Eventos
        window.cyInstance.on('mouseover', 'node', e => {
            const node = e.target;
            const cy = window.cyInstance;
            
            // Mostra nome completo ao passar o mouse (Tooltip improvisado)
            // Para fazer algo profissional, precisaria de libs externas, 
            // mas aqui podemos injetar no DOM se quiser depois.
            
            cy.elements().removeClass('highlight prerequisito-path libera-path faded').addClass('faded');
            node.removeClass('faded').addClass('highlight');
            node.predecessors().removeClass('faded').addClass('prerequisito-path');
            node.successors().removeClass('faded').addClass('libera-path');
        });
        
        window.cyInstance.on('mouseout', 'node', () => {
            window.cyInstance.elements().removeClass('highlight prerequisito-path libera-path faded');
        });

        window.cyInstance.on('tap', 'node[tipo="optativa"]', e => {
            const node = e.target;
            window.grupoSendoEditado = node.id();
            if (typeof abrirModalSelecao === 'function') abrirModalSelecao(node.id(), 0); 
        });

        // AJUSTE FINAL: Garante que caiba na tela
        window.cyInstance.ready(() => {
            window.cyInstance.fit(elements, 30);
        });
    }
}