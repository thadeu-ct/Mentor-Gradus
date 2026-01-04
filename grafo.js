// =========================================================
//  MENTOR GRADUS - GRAFO.JS (Versão Blindada & Segura)
// =========================================================

// --- BLOCO DE SOBRESCRITA DE SEGURANÇA ---
// Este bloco roda imediatamente ao carregar o arquivo, substituindo as funções
// "perigosas" do app.js APENAS nesta página de Grafo.

// 1. SEGURANÇA TOTAL: Impede que o Grafo salve alterações no LocalStorage do Planner
window.salvarBoardLocal = function() {
    console.log("🔒 Salvar bloqueado na página de Grafo para proteger seus dados do Planner.");
};

// 2. CORREÇÃO DE CRASH: Impede o erro de tentar criar colunas onde não existe board
window.adicionarColunaPeriodo = function() {
    console.log("🔒 Adicionar Coluna desativado nesta visualização.");
};

// 3. CORREÇÃO DA SIDEBAR: Restaura apenas os botões (chips), ignorando o board
// Isso corrige a tela branca ao carregar
window.carregarBoardLocal = function() {
    const salvo = localStorage.getItem('mentorGradus_Estado');
    if (!salvo) return;
    const dados = JSON.parse(salvo);

    // Função auxiliar interna para restaurar os chips visualmente
    const restaurarChips = (seletorArea, seletorDropdown, lista) => {
        const area = document.querySelector(seletorArea);
        const dropdown = document.querySelector(seletorDropdown);
        if(!area) return;
        area.innerHTML = '';
        if (!lista) return;

        lista.forEach(val => {
            const span = document.createElement('span');
            span.className = 'chip-selected';
            span.dataset.value = val;
            // Abrevia nomes longos
            const texto = val.startsWith("Engenharia de ") ? "Eng. " + val.substring(14) : val;
            span.innerHTML = `${texto} <i class="fas fa-times"></i>`;
            area.appendChild(span);

            // Marca como selecionado no dropdown
            if (dropdown) {
                const op = dropdown.querySelector(`.chip[data-value="${val}"]`);
                if (op) op.classList.add('disabled');
            }
        });
    };

    // Restaura as seleções salvas
    restaurarChips("#formacoes-selection", "#formacoes-options", dados.selecoes.formacoes);
    restaurarChips("#dominios-selection", "#dominios-options", dados.selecoes.dominios);
    
    // Atualiza lógica de ênfases antes de restaurar a ênfase específica
    if (typeof window.atualizarEnfasesDisponiveis === 'function') {
        window.atualizarEnfasesDisponiveis();
    }

    // Restaura a ênfase se houver
    if (dados.selecoes.enfase) {
        const areaEnf = document.querySelector("#enfase-selection");
        const dropEnf = document.querySelector("#enfase-options");
        // Só restaura se a opção ainda for válida no dropdown
        if(areaEnf && dropEnf && dropEnf.querySelector(`.chip[data-value="${dados.selecoes.enfase}"]`)) {
            const val = dados.selecoes.enfase;
            const span = document.createElement('span');
            span.className = 'chip-selected';
            span.dataset.value = val;
            span.innerHTML = `${val} <i class="fas fa-times"></i>`;
            areaEnf.innerHTML = '';
            areaEnf.appendChild(span);
            const op = dropEnf.querySelector(`.chip[data-value="${val}"]`);
            if(op) op.classList.add('disabled');
        }
    }
    
    // Força o primeiro desenho do grafo
    atualizarGrafoLogica();
};

// 4. CORREÇÃO DE LÓGICA: Permite múltiplas formações sem esconder as ênfases
window.atualizarEnfasesDisponiveis = function() {
    const formacoes = pegarValoresSelecionados("#formacoes-selection"); // Função global do app.js
    const sectionEnfase = document.getElementById('enfase-section');
    
    let todasEnfases = new Set();

    // Soma as ênfases de TODOS os cursos selecionados
    formacoes.forEach(curso => {
        if (window.dadosFormacoes[curso] && window.dadosFormacoes[curso].enfase) {
            Object.keys(window.dadosFormacoes[curso].enfase).forEach(e => todasEnfases.add(e));
        }
    });

    if (todasEnfases.size > 0) {
        // Usa a função popularDropdown global do app.js
        popularDropdown('#enfase-options', Array.from(todasEnfases));
        sectionEnfase.style.display = 'block';
    } else {
        sectionEnfase.style.display = 'none';
        const area = document.getElementById('enfase-selection');
        if(area) area.innerHTML = ''; 
    }
};

// 5. OTIMIZAÇÃO: Desliga chamadas desnecessárias ao backend python nesta página
window.processarEstadoDoBackend = function() {
    // Ao clicar em chips, apenas atualiza a UI local
    if (typeof window.atualizarEnfasesDisponiveis === 'function') {
        window.atualizarEnfasesDisponiveis();
    }
    atualizarGrafoLogica();
};


// --- INICIALIZAÇÃO PADRÃO DO GRAFO ---

document.addEventListener("DOMContentLoaded", () => {
    // Carrega extensões do Cytoscape
    try { 
        if (typeof cytoscapeDagre !== 'undefined') cytoscape.use(cytoscapeDagre); 
    } catch (e) { console.log("Aviso: Dagre já carregado."); }
    
    // Conecta a função global para uso externo se necessário
    window.atualizarGrafo = atualizarGrafoLogica;

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

function atualizarGrafoLogica() {
    console.log("🕸️ Atualizando visual do Grafo...");

    // Captura seleções de forma segura
    const formacoesChips = Array.from(document.querySelectorAll("#formacoes-selection .chip-selected"));
    const enfaseChip = document.querySelector("#enfase-selection .chip-selected");
    const dominiosChips = Array.from(document.querySelectorAll("#dominios-selection .chip-selected"));

    const container = document.getElementById('cy');
    
    // CASO VAZIO: Se não tiver formação, limpa e avisa
    if (formacoesChips.length === 0) {
        if (window.cyInstance) {
            window.cyInstance.destroy();
            window.cyInstance = null;
        }
        if(container) container.innerHTML = '<div style="display:flex; height:100%; align-items:center; justify-content:center; color:#777; font-size:1.2rem;">Selecione uma Formação na barra lateral para visualizar o grafo.</div>';
        return;
    }

    // Se tinha mensagem de aviso, limpa para desenhar
    if (container && container.innerText.includes("Selecione uma Formação")) {
        container.innerHTML = '';
    }

    // Coleta dados das matérias
    const nomeEnfase = enfaseChip ? enfaseChip.dataset.value : null;
    let codigosParaExibir = new Set();
    const adicionar = (lista) => { if (lista) lista.forEach(c => codigosParaExibir.add(c)); };

    formacoesChips.forEach(chip => {
        const dadosCurso = window.dadosFormacoes[chip.dataset.value];
        if (dadosCurso) {
            adicionar(dadosCurso.obrigatórias);
            if (nomeEnfase && dadosCurso.enfase && dadosCurso.enfase[nomeEnfase]) {
                adicionar(dadosCurso.enfase[nomeEnfase].obrigatórias);
            }
        }
    });

    dominiosChips.forEach(chip => {
        const dadosDominio = window.dadosDominios[chip.dataset.value];
        if (dadosDominio) adicionar(dadosDominio.obrigatórias);
    });

    // Filtra e desenha
    const materiasFiltradas = window.dadosMaterias.filter(m => codigosParaExibir.has(m.codigo));
    desenharCytoscape(materiasFiltradas);
}

function desenharCytoscape(materias) {
    const container = document.getElementById('cy');
    if (!container) return;

    const elements = [];
    const materiasSet = new Set(materias.map(m => m.codigo));

    // Nós
    materias.forEach(mat => {
        const labelNome = mat.nome.length > 25 ? mat.nome.substring(0, 25) + '...' : mat.nome;
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
                            data: { source: prereqCod, target: mat.codigo }
                        });
                    }
                });
            });
        }
    });

    const estilo = [
        {
            selector: 'node',
            style: {
                'shape': 'round-rectangle',
                'background-color': 'white',
                'border-width': 2,
                'border-color': '#34495e',
                'label': 'data(label)',
                'text-valign': 'center', 'text-halign': 'center', 'text-wrap': 'wrap',
                'width': '140px', 'height': '60px', 'font-size': '11px', 'font-weight': 'bold', 'color': '#2c3e50'
            }
        },
        {
            selector: 'edge',
            style: {
                'width': 2, 'line-color': '#bdc3c7', 'target-arrow-color': '#bdc3c7',
                'target-arrow-shape': 'triangle', 'curve-style': 'bezier'
            }
        },
        { selector: '.highlight', style: { 'background-color': '#fff3e0', 'border-color': '#f39c12', 'border-width': 3 } },
        { selector: '.prerequisito', style: { 'border-color': '#e74c3c', 'line-color': '#e74c3c', 'target-arrow-color': '#e74c3c', 'width': 3 } },
        { selector: '.libera', style: { 'border-color': '#27ae60', 'line-color': '#27ae60', 'target-arrow-color': '#27ae60', 'width': 3 } },
        { selector: '.faded', style: { 'opacity': 0.1 } }
    ];

    if (window.cyInstance) {
        window.cyInstance.json({ elements: elements });
        // Recalcula o layout suavemente
        window.cyInstance.layout({ name: 'dagre', rankDir: 'TB', animate: true, animationDuration: 500 }).run();
    } else {
        window.cyInstance = cytoscape({
            container: container,
            elements: elements,
            style: estilo,
            layout: { name: 'dagre', rankDir: 'TB' },
            minZoom: 0.2, maxZoom: 2, wheelSensitivity: 0.2
        });
        
        // Interatividade
        window.cyInstance.on('mouseover', 'node', e => {
            const node = e.target;
            const cy = window.cyInstance;
            cy.elements().removeClass('highlight prerequisito libera faded').addClass('faded');
            node.removeClass('faded').addClass('highlight');
            node.predecessors().removeClass('faded').addClass('prerequisito');
            node.successors().removeClass('faded').addClass('libera');
        });
        
        window.cyInstance.on('mouseout', 'node', () => {
            window.cyInstance.elements().removeClass('highlight prerequisito libera faded');
        });
    }
}