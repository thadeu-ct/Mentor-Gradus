// =========================================================
//  MENTOR GRADUS - GRAFO.JS (Versão Árvore Hierárquica 🌳)
// =========================================================

// Estado local para guardar substituições de optativas (ex: "INF0300" virou "FIL1000")
const substituicoesOptativas = {};

// --- BLOCO DE SEGURANÇA & OVERRIDES ---
window.salvarBoardLocal = function() { console.log("🔒 Salvar bloqueado no Grafo."); };
window.adicionarColunaPeriodo = function() { console.log("🔒 Adicionar Coluna bloqueado."); };

// Override para inicializar o grafo corretamente sem desenhar colunas
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

// Override da função do Modal para funcionar dentro do Grafo
// Quando o usuário escolhe uma matéria no Modal, rodamos isso:
window.selecionarMateriaDoModal = function(materia) {
    console.log("🎯 Matéria escolhida no grafo:", materia.codigo);
    
    // Descobre qual grupo estava sendo substituído
    const codigoGrupo = window.grupoSendoEditado;
    if (codigoGrupo) {
        // Salva a escolha na memória do grafo
        substituicoesOptativas[codigoGrupo] = materia;
        
        // Fecha modal
        document.getElementById('modal-selecao').classList.add('escondido');
        document.getElementById('modal-backdrop').classList.add('escondido');
        
        // Redesenha a árvore com a nova matéria
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
            setTimeout(() => { if (window.cyInstance) { window.cyInstance.resize(); window.cyInstance.fit(); } }, 350);
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

    // 1. Coleta os Códigos Visíveis
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

    // 2. Monta os Elementos (Nós e Arestas)
    const elements = [];
    const nosAdicionados = new Set();

    // Helper para adicionar nó
    const criarNo = (codigo, nome, tipo) => {
        if (nosAdicionados.has(codigo)) return;
        
        let label = nome;
        if (nome.length > 25) label = nome.substring(0, 25) + '...';
        
        elements.push({
            group: 'nodes',
            data: { id: codigo, label: `${codigo}\n${label}`, tipo: tipo }
        });
        nosAdicionados.add(codigo);
    };

    // Filtra as matérias base
    const materiasBase = window.dadosMaterias.filter(m => codigosParaExibir.has(m.codigo));

    materiasBase.forEach(mat => {
        // Verifica se tem substituição (Optativa escolhida)
        // Mas aqui estamos iterando as obrigatórias da grade.
        // A substituição acontece nos REQUISITOS.
        criarNo(mat.codigo, mat.nome, 'normal');
    });

    // 3. Processa Arestas e cria Nós de Optativas/Grupos
    materiasBase.forEach(mat => {
        
        // --- PRÉ-REQUISITOS (Linha Sólida) ---
        if (mat.prereqs) {
            mat.prereqs.forEach(grupo => {
                grupo.forEach(req => {
                    // Verifica se o requisito é um Grupo Optativo (ex: INF0300)
                    const ehGrupo = (req.length === 7 && req.includes('00'));
                    
                    let origem = req;
                    
                    // Lógica de Substituição: O usuário escolheu algo para esse grupo?
                    if (ehGrupo && substituicoesOptativas[req]) {
                        const matEscolhida = substituicoesOptativas[req];
                        origem = matEscolhida.codigo;
                        // Cria o nó da matéria escolhida (se ainda não existir)
                        criarNo(matEscolhida.codigo, matEscolhida.nome, 'escolhida');
                        
                        // IMPORTANTE: Se escolheu uma matéria, ela traz os PRÓPRIOS pré-requisitos para o grafo!
                        // (Isso cria a árvore dinâmica que você pediu)
                        if (matEscolhida.prereqs) {
                            matEscolhida.prereqs.forEach(g => g.forEach(p => {
                                criarNo(p, p, 'normal'); // Adiciona o pai da escolhida (simplificado sem nome p/ garantir)
                                elements.push({ group: 'edges', data: { source: p, target: origem }, classes: 'prerequisito' });
                            }));
                        }

                    } else if (ehGrupo) {
                        // Se não escolheu, cria o nó do Grupo (Laranja)
                        const nomeGrupo = window.dadosOptativas[req] ? (window.dadosOptativas[req].nome || "Optativa") : "Grupo Optativo";
                        criarNo(req, nomeGrupo, 'optativa');
                    } else {
                        // Requisito normal, garante que o nó existe (pode ser de outro curso)
                        if (!nosAdicionados.has(req)) criarNo(req, req, 'normal');
                    }

                    // Cria a aresta Sólida
                    elements.push({
                        group: 'edges',
                        data: { source: origem, target: mat.codigo },
                        classes: 'prerequisito'
                    });
                });
            });
        }

        // --- CORREQUISITOS (Linha Pontilhada) ---
        if (mat.correq) {
            mat.correq.forEach(grupo => {
                grupo.forEach(req => {
                    // Mesma lógica de grupo/normal
                    if (!nosAdicionados.has(req)) criarNo(req, req, 'normal');
                    
                    elements.push({
                        group: 'edges',
                        data: { source: req, target: mat.codigo },
                        classes: 'correquisito' // Classe para pontilhado
                    });
                });
            });
        }
    });

    desenharCytoscape(elements);
}

function desenharCytoscape(elements) {
    const container = document.getElementById('cy');
    
    const estilo = [
        // NÓ NORMAL (Azul/Branco)
        {
            selector: 'node[tipo="normal"], node[tipo="escolhida"]',
            style: {
                'shape': 'round-rectangle',
                'background-color': 'white',
                'border-width': 2, 'border-color': '#34495e',
                'label': 'data(label)',
                'text-valign': 'center', 'text-halign': 'center', 'text-wrap': 'wrap',
                'width': '140px', 'height': '60px', 'font-size': '11px', 'font-weight': 'bold', 'color': '#2c3e50'
            }
        },
        // NÓ OPTATIVA/GRUPO (Laranja)
        {
            selector: 'node[tipo="optativa"]',
            style: {
                'shape': 'round-rectangle',
                'background-color': '#fff3e0',
                'border-width': 2, 'border-color': '#e67e22',
                'label': 'data(label)',
                'text-valign': 'center', 'text-halign': 'center', 'text-wrap': 'wrap',
                'width': '140px', 'height': '60px', 'font-size': '11px', 'font-weight': 'bold', 'color': '#d35400',
                'border-style': 'dashed'
            }
        },
        // ARESTA SÓLIDA (Pré-requisito)
        {
            selector: 'edge.prerequisito',
            style: {
                'width': 2, 
                'line-color': '#95a5a6', 
                'target-arrow-color': '#95a5a6',
                'target-arrow-shape': 'triangle', 
                'curve-style': 'bezier'
            }
        },
        // ARESTA PONTILHADA (Correquisito)
        {
            selector: 'edge.correquisito',
            style: {
                'width': 2,
                'line-color': '#7f8c8d',
                'target-arrow-color': '#7f8c8d',
                'target-arrow-shape': 'circle', // Diferente para destacar
                'line-style': 'dashed',         // <--- PONTILHADO AQUI
                'curve-style': 'bezier'
            }
        },
        // ESTADOS DE HOVER
        { selector: '.highlight', style: { 'background-color': '#d6eaf8', 'border-color': '#3498db', 'border-width': 3 } },
        { selector: '.prerequisito-path', style: { 'line-color': '#e74c3c', 'target-arrow-color': '#e74c3c', 'width': 3 } },
        { selector: '.libera-path', style: { 'line-color': '#27ae60', 'target-arrow-color': '#27ae60', 'width': 3 } },
        { selector: '.faded', style: { 'opacity': 0.1 } }
    ];

    // Configuração Hierárquica (Árvore)
    const layoutConfig = { 
        name: 'dagre', 
        rankDir: 'TB',    // Top to Bottom (Hierarquia Vertical)
        nodeSep: 40,      // Espaço horizontal
        rankSep: 80,      // Espaço vertical (níveis)
        padding: 30,
        animate: true,
        animationDuration: 600
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
            minZoom: 0.2, maxZoom: 2, wheelSensitivity: 0.2
        });
        
        // EVENTO 1: Hover (Highlight)
        window.cyInstance.on('mouseover', 'node', e => {
            const node = e.target;
            const cy = window.cyInstance;
            cy.elements().removeClass('highlight prerequisito-path libera-path faded').addClass('faded');
            node.removeClass('faded').addClass('highlight');
            node.predecessors().removeClass('faded').addClass('prerequisito-path');
            node.successors().removeClass('faded').addClass('libera-path');
        });
        
        window.cyInstance.on('mouseout', 'node', () => {
            window.cyInstance.elements().removeClass('highlight prerequisito-path libera-path faded');
        });

        // EVENTO 2: Clique na Optativa (Abre Modal)
        window.cyInstance.on('tap', 'node[tipo="optativa"]', e => {
            const node = e.target;
            const codigoGrupo = node.id();
            
            console.log("Abrindo modal para grupo:", codigoGrupo);
            
            // Define variável global para saber quem estamos editando
            window.grupoSendoEditado = codigoGrupo;
            
            // Chama a função global do app.js para abrir o modal
            if (typeof abrirModalSelecao === 'function') {
                // Passa creditos = 0 só pra cumprir assinatura, o foco é a escolha
                abrirModalSelecao(codigoGrupo, 0); 
            } else {
                alert("Erro: Modal não encontrado. Verifique se app.js carregou.");
            }
        });
    }
}