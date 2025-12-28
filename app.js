// Banco de dados local de matérias (cache)
window.materiasData = []; 
window.estadoBackend = null;
window.dadosOptativas = {};
let dadosFormacoes = {};
let dadosDominios = {};
let periodCounter = 2;
const MAX_CREDITS_PER_PERIOD = 30;

// --- Funções de Componente (Carregar Header/Footer) ---
function loadComponent(url, elementId) {
    fetch(url)
        .then(response => response.ok ? response.text() : Promise.reject(response.statusText))
        .then(data => {
            const element = document.getElementById(elementId);
            if (element) element.innerHTML = data;
            if (elementId === 'header-placeholder') {
                updateActiveNavLink();
            }
            if (elementId === 'footer-placeholder') {
                updateCopyrightYear();
            }
        })
        .catch(error => {
            console.error(error);
            const element = document.getElementById(elementId);
            if (element) element.innerHTML = "<p>Erro ao carregar componente.</p>";
        });
}

function updateCopyrightYear() {
    const yearSpan = document.getElementById("current-year");
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();
}

// --- Funções da Sidebar (Toggles) ---
function initializeSidebar() {
    const toggleButton = document.getElementById("toggle-sidebar-btn");
    const sidebar = document.querySelector(".sidebar");
    const mainContent = document.querySelector(".planner-board");
    if (toggleButton && sidebar && mainContent) {
        toggleButton.addEventListener("click", () => {
            sidebar.classList.toggle("recolhido");
            mainContent.classList.toggle("recolhido");
        });
    }
}

function initializePoolToggle() {
    const toggleButton = document.getElementById("toggle-pool-btn");
    const poolSidebar = document.querySelector(".materia-pool");
    const mainContent = document.querySelector(".planner-board");
    if (toggleButton && poolSidebar && mainContent) {
        toggleButton.addEventListener("click", () => {
            poolSidebar.classList.toggle("pool-recolhido");
            mainContent.classList.toggle("pool-recolhido");
        });
    }
}

// --- Funções de Card e Créditos ---
function createMateriaCard(materia, tipo = 'obrigatoria') {
    if (!materia) return;

    const card = document.createElement('div');
    card.className = 'materia-card';
    card.dataset.codigo = materia.codigo;
    card.id = 'card-' + materia.codigo;
    card.draggable = true;

    let corBarra = '#3498db'; // Azul para Obrigatória
    let textoTag = 'Obrigatória';
    if (tipo === 'optativa') {
        corBarra = '#f39c12'; // Laranja para Optativa (escolhida)
        textoTag = 'Optativa';
    }

    // Formata os pré-requisitos para "A E B OU C"
    const prereqsTexto = (materia.prereqs && materia.prereqs.length > 0 && materia.prereqs[0].length > 0) 
        ? materia.prereqs.map(grupo => grupo.join(' E ')).join(' OU ') 
        : 'Nenhum';
    
    const correqsTexto = (materia.correq && materia.correq.length > 0 && materia.correq[0].length > 0)
        ? materia.correq.map(grupo => grupo.join(' E ')).join(' OU ')
        : 'Nenhum';

    card.innerHTML = `
        <div class="card-header-bar" style="background-color: ${corBarra};"></div> 
        <div class="card-content">
            <div>
                <span class="card-code">${materia.codigo}</span>
                <span class="card-chip creditos">${materia.creditos} Créditos</span>
            </div>
            <h4 class="card-title">${materia.nome}</h4>
            <div class="card-prereqs">
                <strong>Pré-req:</strong> <span>${prereqsTexto}</span>
            </div>
             <div class="card-prereqs" style="margin-top:4px;">
                <strong>Correq:</strong> <span>${correqsTexto}</span>
            </div>
        </div>
        <div class="card-footer">
            <span class="category-tag ${tipo}">${textoTag}</span>
        </div>
    `;
    return card;
}

function updateCreditCounters() {
    document.querySelectorAll('.board-column').forEach(coluna => {
        let totalCreditos = 0;
        coluna.querySelectorAll('.materia-card').forEach(card => {
            // Tenta achar no DB global
            let materia = window.materiasData.find(m => m.codigo === card.id.replace('card-', ''));
            if (materia) {
                totalCreditos += materia.creditos;
            } else {
                // Fallback se não achar
                const chip = card.querySelector('.card-chip.creditos');
                if (chip) totalCreditos += parseInt(chip.textContent, 10) || 0;
            }
        });
        const counterSpan = coluna.querySelector('.column-credit-counter');
        if (counterSpan) {
            counterSpan.textContent = totalCreditos + ' Créditos';
            if (totalCreditos > MAX_CREDITS_PER_PERIOD) {
                counterSpan.classList.add('error'); // Classe de erro do CSS
            } else {
                counterSpan.classList.remove('error');
            }
        }
    });
}

/**
 * Adiciona a classe '.active' ao link de navegação da página atual.
 */
function updateActiveNavLink() {
    const path = window.location.pathname;
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    if (path.endsWith('planner.html')) {
        document.getElementById('nav-link-planner')?.classList.add('active');
    } else if (path.endsWith('grade.html')) {
        document.getElementById('nav-link-grade')?.classList.add('active');
    }
}

/**
 * [GRADE] Cria o item simples para o POOL da direita.
 */
function renderGradePoolItem(materia) {
    const poolContainer = document.getElementById("pool-list-container");
    if (!poolContainer) return;

    const item = document.createElement('div');
    item.className = 'pool-item'; // Reutiliza o estilo base do pool
    
    // Damos a cor (azul/laranja) do planner
    const tipo = materia.tipo || 'optativa'; // (Precisamos carregar o 'tipo'
    item.classList.add(tipo === 'obrigatoria' ? 'pool-item-obrigatoria' : 'pool-item-optativa');

    // ID único para cada "bloco de 1h"
    // Ex: fis4001_1, fis4001_2
    const count = poolContainer.querySelectorAll(`[data-codigo="${materia.codigo}"]`).length + 1;
    item.id = `grade-pool-item-${materia.codigo}_${count}`;
    item.draggable = true; 

    // Salva o código original no dataset para o dragstart
    item.dataset.codigoOriginal = materia.codigo;
    
    item.innerHTML = `
        <div class="pool-item-main-content">
            <span class="pool-item-code">${materia.codigo}</span>
            <span class="pool-item-title">${materia.nome}</span>
        </div>
        `;
    poolContainer.appendChild(item);
}

/**
 * [GRADE] Cria o "mini-card" que é solto na grade.
 */
function createGradeCard(materia, draggedItem) {
    if (!materia) return;

    const card = document.createElement('div');
    card.className = 'grade-card';
    card.dataset.codigo = materia.codigo;
    card.id = 'grade-card-' + draggedItem.id;
    card.draggable = true;

    if (draggedItem.classList.contains('pool-item-obrigatoria')) {
        card.classList.add('obrigatoria');
    } else {
        card.classList.add('optativa');
    }

    card.innerHTML = `
        <span class="grade-card-code">${materia.codigo}</span>
        <span class="grade-card-title">${materia.nome}</span>
        `;
    return card;
}

/**
 * Funções específicas do PLANNER.HTML
 */
function initializePlannerPage() {
    carregarDadosIniciais().then(() => {
        initializeChipSelectors(); 
        initializeBoardControls(); 
        document.querySelectorAll('.column-content, .pool-list').forEach(addDragEventsToTarget);
        processarEstadoDoBackend(); 
    }).catch(err => {
        console.error("Falha ao inicializar dados:", err);
        alert("Erro ao carregar dados do servidor. A página pode não funcionar.");
    });
}

/*
 * Funções específicas do GRADE.HTML
 */
function initializeGradePage() {
    // Adiciona 'listeners' de drop às células da grade, 'online' e ao pool
    document.querySelectorAll('.grid-dropzone, .pool-list').forEach(addDragEventsToTarget);

    // (PRÓXIMO PASSO: carregar dados dos períodos aqui)
}

async function carregarDadosIniciais() {
    console.log("Carregando dados iniciais do servidor...");
    try {
        // 1. Busca Formações
        const formResponse = await fetch('/api/get-formacoes');
        if (!formResponse.ok) throw new Error('Falha ao buscar formações');
        
        // Salva na variável local E no window (global)
        const dadosF = await formResponse.json();
        dadosFormacoes = dadosF;       // Para uso interno do app.js
        window.dadosFormacoes = dadosF; // Para o grafo.js poder ler!

        // 2. Busca Domínios
        const domResponse = await fetch('/api/get-dominios');
        if (!domResponse.ok) throw new Error('Falha ao buscar domínios');
        
        const dadosD = await domResponse.json();
        dadosDominios = dadosD;
        window.dadosDominios = dadosD; // Para o grafo.js poder ler!

        // 3. Popula os dropdowns
        popularDropdown('#formacoes-options', Object.keys(dadosFormacoes));
        popularDropdown('#dominios-options', Object.keys(dadosDominios));
        
        const optResponse = await fetch('/api/get-dados-optativas');
        if (optResponse.ok) {
            window.dadosOptativas = await optResponse.json();
        }

        console.log("Dados iniciais carregados e Globais:", { dadosFormacoes, dadosDominios });

    } catch (error) {
        console.error("Erro em carregarDadosIniciais:", error);
        return Promise.reject(error);
    }
}

// (NOVO) Helper para popular os dropdowns
function popularDropdown(selector, opcoes) {
    const optionsEl = document.querySelector(selector);
    if (!optionsEl) return;
    optionsEl.innerHTML = ''; // Limpa opções antigas
    
    opcoes.forEach(opcao => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.dataset.value = opcao;
        
        // Tenta encurtar nomes longos (opcional, mas bom para UI)
        let displayName = opcao;
        if (opcao.startsWith("Engenharia de ")) {
            displayName = "Eng. " + opcao.substring(14);
        }
        
        chip.textContent = displayName;
        optionsEl.appendChild(chip);
    });
}

/**
 * Helper para pegar dados de um card
 */
function getMateriaDataFromCard(cardElement) {
    if (!cardElement) return null;
    const codigo = cardElement.dataset.codigo;
    return window.materiasData.find(m => m.codigo === codigo);
}

/**
 * Validação em Cascata (Planner)
 */
function validarBoardEmCascata() {
    console.log("--- INICIANDO VALIDAÇÃO EM CASCATA ---");
    let mudancasFeitas = true;
    let materiasRemovidasDoBoard = new Set();
    const totalPeriodos = document.querySelectorAll('.board-column').length;

    while (mudancasFeitas) {
        mudancasFeitas = false;
        let materiasValidasAcumuladas = new Set();

        for (let i = 1; i <= totalPeriodos; i++) {
            const colunaId = `column-p${i}`;
            const coluna = document.getElementById(colunaId);
            if (!coluna) continue;

            const contentEl = coluna.querySelector('.column-content');
            const cardsNoPeriodo = Array.from(contentEl.querySelectorAll('.materia-card'));
            let creditosNestePeriodo = 0;
            let materiasValidasNestePeriodo = new Set();

            for (const card of cardsNoPeriodo) {
                const materia = getMateriaDataFromCard(card);
                if (!materia) continue;

                const validacao = validarRegrasDeNegocio(materia, `p${i}`);
                const creditosOK = (creditosNestePeriodo + materia.creditos) <= MAX_CREDITS_PER_PERIOD;

                if (validacao.ok && creditosOK) {
                    creditosNestePeriodo += materia.creditos;
                    materiasValidasNestePeriodo.add(materia.codigo);
                } else {
                    mudancasFeitas = true; 
                    card.remove(); 
                    
                    const proximoPeriodoNum = i + 1;
                    if (proximoPeriodoNum <= totalPeriodos) {
                        const proximoContentEl = document.getElementById(`column-p${proximoPeriodoNum}`)
                                                        .querySelector('.column-content');
                        if (proximoContentEl) {
                            proximoContentEl.appendChild(card);
                        } else {
                            materiasRemovidasDoBoard.add(materia.nome);
                        }
                    } else {
                        materiasRemovidasDoBoard.add(materia.nome);
                    }
                }
            } 
            
            materiasValidasNestePeriodo.forEach(codigoMateria => {
                materiasValidasAcumuladas.add(codigoMateria);
            });

        } 
    } 

    if (materiasRemovidasDoBoard.size > 0) {
        const nomesMaterias = Array.from(materiasRemovidasDoBoard).join(', ');
        alert(`As seguintes matérias foram removidas por quebra de pré-requisitos em cascata: ${nomesMaterias}`);
    }

    console.log("--- VALIDAÇÃO EM CASCATA CONCLUÍDA ---");
    updateCreditCounters();
    atualizarContadorCreditos();
    processarEstadoDoBackend();
}

// --- LÓGICA DE ESTADO E BACKEND ---

function getMateriasNoBoard() {
    const cardsNoBoard = document.querySelectorAll('#board-container .materia-card');
    return Array.from(cardsNoBoard).map(card => card.dataset.codigo); 
}

function getSetGlobalDeMateriasCursadas() {
    const materiasNoPool = [];
    document.querySelectorAll('#pool-list-container .pool-item').forEach(item => {
        const codigo = item.dataset.codigoOriginal || item.id.replace('pool-item-', '');
        materiasNoPool.push(codigo);
    });

    const materiasNoBoard = getMateriasNoBoard();
    const setGlobal = new Set([...materiasNoPool, ...materiasNoBoard]);
    console.log("Set Global de Cursadas (para API):", setGlobal);
    return setGlobal;
}

function addMateriaToDB(materia) {
    if (!materia || !materia.codigo) return;
    if (!window.materiasData.find(m => m.codigo === materia.codigo)) {
        window.materiasData.push(materia);
    }
}

function processarEstadoDoBackend(materiaManual = null) {
    const formacoesEl = document.getElementById("formacoes-selection");
    if (!formacoesEl) return; 

    const formacoes = Array.from(formacoesEl.querySelectorAll(".chip-selected")).map(chip => chip.dataset.value);
    const dominios = Array.from(document.querySelectorAll("#dominios-selection .chip-selected")).map(chip => chip.dataset.value);

    const enfaseChip = document.querySelector("#enfase-selection .chip-selected");
    const enfase = enfaseChip ? enfaseChip.dataset.value : null;

    const preSelecionadas = getMateriasNoBoard();

    if (materiaManual && !preSelecionadas.includes(materiaManual)) {
        preSelecionadas.push(materiaManual);
    }

    const data = {
        "formacoes": formacoes,
        "dominios": dominios,
        "enfase_escolhida": enfase,
        "pre_selecionadas": preSelecionadas
    };

    console.log("Enviando para /api/processar-estado:", data);

    fetch('/api/processar-estado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    })
    .then(response => response.ok ? response.json() : Promise.reject(response.statusText))
    .then(estado => {
        console.log("Recebido do Python:", estado);

        window.estadoBackend = estado;

        const poolContainer = document.getElementById("pool-list-container");
        if (!poolContainer) return;
        poolContainer.innerHTML = ''; 

        estado.obrigatorias.forEach(materia => {
            addMateriaToDB(materia); 
            renderItemNoPool(materia, 'obrigatoria');
        });
        
        estado.optativas_escolhidas.forEach(materia => {
            addMateriaToDB(materia); 
            renderItemNoPool(materia, 'optativa');
        });
        
        estado.grupos_pendentes.forEach(grupo => {
            renderGrupoPendenteNoPool(grupo);
        });

        filtrarPool(); 
        updateCreditCounters();
        atualizarContadorCreditos();
    })
    .catch(error => console.error("Erro ao conectar com o backend:", error));
}

// --- LÓGICA DE RENDERIZAÇÃO DO POOL ---

function normalizeText(text) {
    if (!text) return '';
    return text.toString().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function renderItemNoPool(materia, tipo) {
    const poolContainer = document.getElementById("pool-list-container");
    if (!poolContainer) return;

    const cardExistente = document.getElementById('card-' + materia.codigo);
    if (cardExistente) {
        return; // Já está no board, não mostra no pool
    }

    const item = document.createElement('div');
    item.className = 'pool-item';
    item.id = 'pool-item-' + materia.codigo;
    item.draggable = true; 

    item.dataset.codigo = normalizeText(materia.codigo);
    item.dataset.nome = normalizeText(materia.nome);

    item.classList.add(tipo === 'obrigatoria' ? 'pool-item-obrigatoria' : 'pool-item-optativa');

    item.innerHTML = `
        <div class="pool-item-main-content">
            <span class="pool-item-code">${materia.codigo}</span>
            <span class="pool-item-title">${materia.nome}</span>
        </div>
        <i class="fas fa-info-circle pool-item-info-btn"></i>
        <div class="pool-item-details"></div>
    `;
    poolContainer.appendChild(item);
    const infoBtn = item.querySelector('.pool-item-info-btn');
    const detailsContainer = item.querySelector('.pool-item-details');

    infoBtn.addEventListener('click', () => {
        // Checa se já está expandido
        if (item.classList.contains('expanded')) {
            // Se sim, recolhe
            item.classList.remove('expanded');
            detailsContainer.innerHTML = '';
        } else {
            // Se não, expande
            item.classList.add('expanded');
            
            const prereqsTexto = (materia.prereqs && materia.prereqs.length > 0 && materia.prereqs[0].length > 0) 
                ? materia.prereqs.map(grupo => grupo.join(' E ')).join(' OU ') 
                : 'Nenhum';

            const correqsTexto = (materia.correq && materia.correq.length > 0 && materia.correq[0].length > 0)
                ? materia.correq.map(grupo => grupo.join(' E ')).join(' OU ')
                : 'Nenhum';

            detailsContainer.innerHTML = `
                <span class="pool-item-chip creditos">${materia.creditos} Créditos</span>
                <div class="pool-item-prereqs">
                    <strong>Pré-requisitos:</strong> <span>${prereqsTexto}</span>
                </div>
                 <div class="pool-item-prereqs" style="margin-top:5px;">
                    <strong>Correquisitos:</strong> <span>${correqsTexto}</span>
                </div>
            `;
        }
    });
}

function renderGrupoPendenteNoPool(grupo) {
    const poolContainer = document.getElementById("pool-list-container");
    if (!poolContainer) return;
    
    const item = document.createElement('div');
    item.className = 'pool-item-grupo';
    item.id = 'grupo-' + grupo.codigo_grupo;
    item.dataset.faltando = grupo.faltando;

    item.dataset.codigo = normalizeText(grupo.codigo_grupo);
    item.dataset.nome = normalizeText(grupo.fonte); 

    item.innerHTML = `
        <span class="pool-item-title">${grupo.codigo_grupo}</span>
        <span class="pool-item-chip">${grupo.faltando} Créd.</span>
    `;
    
    item.addEventListener('click', () => abrirModalSelecao(grupo.codigo_grupo, grupo.faltando));
    poolContainer.appendChild(item);
}


// --- LÓGICA DO MODAL (Sem mudanças) ---

function abrirModalSelecao(codigoGrupo, faltando) {
    const modal = document.getElementById('modal-selecao');
    const backdrop = document.getElementById('modal-backdrop');
    const titulo = document.getElementById('modal-titulo');
    const descricao = document.getElementById('modal-descricao');
    const listaOpcoes = document.getElementById('modal-lista-opcoes');

    titulo.textContent = `Escolher Matéria`;
    descricao.textContent = `Selecione uma matéria para ${faltando} créditos de ${codigoGrupo}:`;
    listaOpcoes.innerHTML = '<p>Carregando opções...</p>';
    
    modal.classList.remove('escondido');
    backdrop.classList.remove('escondido');
    
    // Chama a função CORRIGIDA
    const materiasCursadasSet = Array.from(getSetGlobalDeMateriasCursadas());
    
    fetch('/api/get-opcoes-grupo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            "codigo_grupo": codigoGrupo,
            "materias_cursadas_set": materiasCursadasSet
        })
    })
    .then(response => response.ok ? response.json() : Promise.reject(response.statusText))
    .then(opcoes => {
        listaOpcoes.innerHTML = '';
        if (opcoes.length === 0) {
            listaOpcoes.innerHTML = '<p>Nenhuma matéria liberada foi encontrada para este grupo no momento.</p>';
            return;
        }
        
        opcoes.forEach(materia => {
            // 1. Formata os pré-requisitos (lendo da chave de DISPLAY)
            const prereqsTexto = (materia.prereqs && materia.prereqs.length > 0 && materia.prereqs[0].length > 0) 
                ? materia.prereqs.map(grupo => grupo.join(' E ')).join(' OU ') 
                : 'Nenhum';

            // 2. Cria o card
            const opcaoBtn = document.createElement('button');
            opcaoBtn.className = 'modal-materia-card'; // <-- Nova classe
            
            // 3. Define o novo innerHTML
            opcaoBtn.innerHTML = `
                <div class="modal-card-main">
                    <span class="modal-card-code">${materia.codigo}</span>
                    <h5 class="modal-card-title">${materia.nome}</h5>
                    <div class="modal-card-prereqs">
                        <strong>Pré-req:</strong>
                        <span>${prereqsTexto}</span>
                    </div>
                </div>
                <span class="modal-card-chip creditos">${materia.creditos} Créd.</span>
            `;
            
            // 4. Adiciona o listener
            opcaoBtn.addEventListener('click', () => selecionarMateriaDoModal(materia));
            listaOpcoes.appendChild(opcaoBtn);
        });
    })
    .catch(error => {
        console.error("Erro ao buscar opções do grupo:", error);
        listaOpcoes.innerHTML = '<p>Erro ao carregar opções. Tente novamente.</p>';
    });
}

function fecharModalSelecao() {
    document.getElementById('modal-selecao').classList.add('escondido');
    document.getElementById('modal-backdrop').classList.add('escondido');
}

/**
 * (Sem mudanças) Chamada quando o usuário CLICA em uma matéria no modal.
 */
function selecionarMateriaDoModal(materia) { // Recebe o OBJETO
    console.log("Matéria selecionada no modal:", materia.codigo);
    
    // Adiciona ao DB global no momento da escolha
    addMateriaToDB(materia);
    
    fecharModalSelecao();
    
    // Roda o processamento, passando o código da matéria escolhida.
    processarEstadoDoBackend(materia.codigo);
}

function initializeModalControls() {
    const backdrop = document.getElementById('modal-backdrop');
    const fecharBtn = document.getElementById('modal-fechar-btn');
    if (backdrop) backdrop.addEventListener('click', fecharModalSelecao);
    if (fecharBtn) fecharBtn.addEventListener('click', fecharModalSelecao);
}


// --- LÓGICA DE SELEÇÃO DE CHIPS ---

// (Substitua a sua 'initializeChipSelectors' por esta)
function initializeChipSelectors() {
    const selectors = [
        { sel: "#formacoes-selection", opt: "#formacoes-options", multi: true },
        { sel: "#dominios-selection", opt: "#dominios-options", multi: true },
        { sel: "#enfase-selection", opt: "#enfase-options", multi: false }
    ];

    function closeAllDropdowns() {
        selectors.forEach(s => {
            document.querySelector(s.opt)?.classList.remove("dropdown-open");
            document.querySelector(s.sel)?.classList.remove("edit-mode");
        });
    }

    selectors.forEach(s => {
        const selectionEl = document.querySelector(s.sel);
        const optionsEl = document.querySelector(s.opt);
        if (!selectionEl || !optionsEl) return; 

        selectionEl.addEventListener("click", event => {
            event.stopPropagation();
            if (event.target.classList.contains('fa-times')) {
                const chipToRemove = event.target.parentElement;
                const value = chipToRemove.dataset.value;
                chipToRemove.remove();
                optionsEl.querySelector(`.chip[data-value="${value}"]`)?.classList.remove("disabled");
                if (s.sel === "#formacoes-selection") {
                    atualizarEnfaseInteligente(selectionEl);
                }
                processarEstadoDoBackend();
                return;
            }
            const isOpen = optionsEl.classList.contains("dropdown-open");
            closeAllDropdowns();
            if (!isOpen) {
                optionsEl.classList.add("dropdown-open");
                selectionEl.classList.add("edit-mode");
            }
        });

        optionsEl.addEventListener("click", event => {
            event.stopPropagation();
            const chip = event.target.closest('.chip');
            if (chip && !chip.classList.contains('disabled')) {
                const value = chip.dataset.value;
                const text = chip.textContent;
                if (!s.multi) {
                    const chipExistente = selectionEl.querySelector('.chip-selected');
                    if (chipExistente) {
                        const valorAntigo = chipExistente.dataset.value;
                        optionsEl.querySelector(`.chip[data-value="${valorAntigo}"]`)?.classList.remove("disabled");
                        chipExistente.remove();
                    }
                }
                const selectedChip = document.createElement('span');
                selectedChip.className = 'chip-selected';
                selectedChip.dataset.value = value;
                selectedChip.textContent = text;
                selectedChip.innerHTML += ' <i class="fas fa-times"></i>';
                
                selectionEl.appendChild(selectedChip);
                chip.classList.add('disabled');
                if (s.sel === "#formacoes-selection") {
                    atualizarEnfaseInteligente(selectionEl);
                }
                processarEstadoDoBackend();
            }
        });
    });

    document.addEventListener("click", closeAllDropdowns);
}

function atualizarEnfaseInteligente(selectionEl) {
    const formacoes = Array.from(selectionEl.querySelectorAll(".chip-selected"))
                           .map(chip => chip.dataset.value);

    let formacaoParaEnfase = null;

    for (let i = formacoes.length - 1; i >= 0; i--) {
        const nomeFormacao = formacoes[i];
        const dados = dadosFormacoes[nomeFormacao]; 
        
        if (dados && dados.enfase && Object.keys(dados.enfase).length > 0) {
            formacaoParaEnfase = nomeFormacao;
            break;
        }
    }

    atualizarDropdownEnfase(formacaoParaEnfase);
}

function atualizarDropdownEnfase(formacao) {
    const enfaseSection = document.getElementById('enfase-section');
    const enfaseOptions = document.getElementById('enfase-options');
    const enfaseSelection = document.getElementById('enfase-selection');
    const enfaseTitle = enfaseSection.querySelector('h3'); 

    if (!enfaseSection || !enfaseOptions || !enfaseSelection) return;
    const chipAtual = enfaseSelection.querySelector('.chip-selected');
    const valorSelecionadoAnterior = chipAtual ? chipAtual.dataset.value : null;

    enfaseOptions.innerHTML = '';

    if (formacao && dadosFormacoes[formacao] && dadosFormacoes[formacao].enfase) {
        const enfasesDisponiveis = Object.keys(dadosFormacoes[formacao].enfase);
        
        if (enfasesDisponiveis.length > 0) {
            let nomeDisplay = formacao;
            if (formacao.startsWith("Engenharia de ")) {
                nomeDisplay = "Eng. " + formacao.substring(14);
            }
            enfaseTitle.textContent = `Ênfase | ${nomeDisplay}`;

            popularDropdown('#enfase-options', enfasesDisponiveis);
            
            if (valorSelecionadoAnterior && enfasesDisponiveis.includes(valorSelecionadoAnterior)) {                
                const chipOpcao = enfaseOptions.querySelector(`.chip[data-value="${valorSelecionadoAnterior}"]`);
                if (chipOpcao) {
                    chipOpcao.classList.add('disabled');
                }
            } else {
                enfaseSelection.innerHTML = '';
            }

            enfaseSection.style.display = 'block';
        } else {
            enfaseSection.style.display = 'none';
            enfaseSelection.innerHTML = ''; 
        }
    } else {
        enfaseSection.style.display = 'none';
        enfaseSelection.innerHTML = '';
    }
}

// --- LÓGICA DE DRAG AND DROP (Limite de 30 créditos) ---
function getCreditosAcumuladosAte(targetPeriodNum) {
    let total = 0;
    for (let i = 1; i < targetPeriodNum; i++) {
        const colunaId = `column-p${i}`;
        const coluna = document.getElementById(colunaId);
        if (coluna) {
            coluna.querySelectorAll('.materia-card').forEach(card => {
                const mat = getMateriaDataFromCard(card);
                if (mat) total += mat.creditos;
            });
        }
    }
    return total;
}

function getMateriasNoPeriodo(periodoId) {
    const setMaterias = new Set();
    const coluna = document.getElementById(`column-${periodoId}`);
    if (coluna) {
        coluna.querySelectorAll('.materia-card').forEach(card => {
            setMaterias.add(card.dataset.codigo);
        });
    }
    return setMaterias;
}

function validarRegrasDeNegocio(materia, targetColumnId) {
    if (!materia) return { ok: true };

    const targetPeriodNum = parseInt(targetColumnId.replace('p', ''), 10);
    
    // Convertemos para Arrays para facilitar a checagem, mas sets são mais rápidos. 
    // Vamos manter sets para a função auxiliar.
    const cursadasAnteriores = getMateriasCursadasAte(targetColumnId);
    const materiasNoMesmoPeriodo = getMateriasNoPeriodo(targetColumnId);
    const creditosAcumulados = getCreditosAcumuladosAte(targetPeriodNum);

    // 1. Valida Créditos
    const minCred = materia["min-cred"] || 0;
    if (minCred > 0 && creditosAcumulados < minCred) {
        return { 
            ok: false, 
            motivo: 'creditos',
            msg: `Esta matéria exige ${minCred} créditos acumulados (você tem ${creditosAcumulados}).`
        };
    }

    // 2. Valida Pré-requisitos (Estritamente ANTES)
    const prereqs = materia.prereqs_funcionais || materia.prereqs || [];
    if (prereqs.length > 0 && !(prereqs.length === 1 && prereqs[0].length === 0)) {
        let algumGrupoValido = false;
        let materiasFaltantesDoMelhorGrupo = [];
        
        for (const grupo of prereqs) {
            if (grupo.length === 0) { algumGrupoValido = true; break; }
            
            // AQUI MUDOU: Usa a função inteligente
            const faltantes = grupo.filter(cod => !requisitoEstaSatisfeito(cod, cursadasAnteriores));
            
            if (faltantes.length === 0) {
                algumGrupoValido = true;
                break;
            } else {
                if (materiasFaltantesDoMelhorGrupo.length === 0) materiasFaltantesDoMelhorGrupo = faltantes;
            }
        }
        
        if (!algumGrupoValido) {
            const nomesFaltantes = materiasFaltantesDoMelhorGrupo.map(cod => {
                // Tenta achar nome da matéria OU usa o nome do grupo se existir
                const m = window.materiasData.find(x => x.codigo === cod);
                if (m) return m.nome;
                if (window.dadosOptativas[cod]) return `Grupo ${cod}`; // Mostra que é um grupo
                return cod;
            }).join(', ');

            return { 
                ok: false, 
                motivo: 'prereq', 
                msg: `Pré-requisitos não atendidos. Faltam: ${nomesFaltantes}`
            };
        }
    }

    // 3. Valida Correquisitos (ANTES ou AGORA)
    const correqs = materia.correq || [];
    if (correqs.length > 0 && !(correqs.length === 1 && correqs[0].length === 0)) {
        for (const grupo of correqs) {
            // AQUI MUDOU: Usa a função inteligente combinando os dois sets
            const setCombinado = new Set([...cursadasAnteriores, ...materiasNoMesmoPeriodo]);
            
            const faltantes = grupo.filter(cod => !requisitoEstaSatisfeito(cod, setCombinado));
            
            if (faltantes.length > 0) {
                 const nomesFaltantes = faltantes.map(cod => {
                    const m = window.materiasData.find(x => x.codigo === cod);
                    if (m) return m.nome;
                    if (window.dadosOptativas[cod]) return `Grupo ${cod}`;
                    return cod;
                }).join(', ');
                
                return { 
                    ok: false, 
                    motivo: 'correq',
                    msg: `Correquisitos faltando (no período atual ou anteriores): ${nomesFaltantes}`
                };
            }
        }
    }

    return { ok: true };
}

function addDragEventsToTarget(target) {
    function getColumnCredits(colunaEl) {
        let total = 0;
        colunaEl.querySelectorAll('.materia-card').forEach(card => {
            const materia = getMateriaDataFromCard(card);
            if (materia) total += materia.creditos;
        });
        return total;
    }

    target.addEventListener('dragover', event => {
        event.preventDefault();
        const draggedEl = document.querySelector('.dragging');
        if (!draggedEl) return;
        
        if (target.classList.contains('column-content')) {
            const creditosSendoArrastados = parseInt(draggedEl.dataset.credits || '0', 10);
            const materiaCodigo = draggedEl.dataset.codigoOriginal;
            if (!materiaCodigo) return;

            const materia = window.materiasData.find(m => m.codigo === materiaCodigo);
            const targetColumnId = target.dataset.columnId;

            const creditosAtuais = getColumnCredits(target);
            const sourceColumnEl = draggedEl.closest('.column-content');
            const sourceColumnId = sourceColumnEl ? sourceColumnEl.dataset.columnId : 'pool';
            const isNewAdd = (sourceColumnId !== targetColumnId);
            const creditosExcedidos = isNewAdd && (creditosAtuais + creditosSendoArrastados > MAX_CREDITS_PER_PERIOD);

            const cursadasSet = getMateriasCursadasAte(targetColumnId);
            const prereqsOK = checkPrerequisitos(materia, cursadasSet);

            if (creditosExcedidos || !prereqsOK) {
                target.classList.add('drag-invalid');
                target.classList.remove('drag-over');
            } else {
                target.classList.add('drag-over');
                target.classList.remove('drag-invalid');
            }
        
        } else if (target.classList.contains('grid-dropzone')) {
            target.classList.add('drag-over');
            target.classList.remove('drag-invalid');
        } else if (target.classList.contains('pool-list')) {
            target.classList.add('drag-over');
            target.classList.remove('drag-invalid');
        }
    });

    target.addEventListener('dragleave', event => {
        target.classList.remove('drag-over');
        target.classList.remove('drag-invalid');
    });

    target.addEventListener('drop', event => {
        event.preventDefault();
        target.classList.remove('drag-over');
        target.classList.remove('drag-invalid');
        
        const codigoOriginal = event.dataTransfer.getData('materia-codigo-original');
        const sourceType = event.dataTransfer.getData('source-type');
        const draggedItem = document.querySelector('.dragging');

        if (!codigoOriginal || !draggedItem) return; 

        if (target.classList.contains('column-content')) {
            const materia = window.materiasData.find(m => m.codigo === codigoOriginal);
            const targetColumnId = target.dataset.columnId;

            const creditosSendoArrastados = parseInt(draggedItem.dataset.credits || '0', 10);
            const creditosAtuais = getColumnCredits(target);
            const sourceColumnEl = draggedItem.closest('.column-content');
            const sourceColumnId = sourceColumnEl ? sourceColumnEl.dataset.columnId : 'pool';
            const isNewAdd = (sourceColumnId !== targetColumnId);

            let correquisitosParaAdicionar = [];
            
            if (materia.correq && materia.correq.length > 0) {
                const cursadas = getMateriasCursadasAte(targetColumnId);
                const noPeriodo = getMateriasNoPeriodo(targetColumnId);
                
                materia.correq.forEach(grupo => {
                    if(!grupo) return;
                    grupo.forEach(codCorreq => {
                        const jaTem = requisitoEstaSatisfeito(codCorreq, cursadas) || requisitoEstaSatisfeito(codCorreq, noPeriodo);
                        
                        if (!jaTem) {
                            const matCorreq = window.materiasData.find(m => m.codigo === codCorreq);
                            
                            if (matCorreq) {
                                const cardJaExiste = document.getElementById("card-" + codCorreq);
                                if (!cardJaExiste) {
                                    correquisitosParaAdicionar.push(matCorreq);
                                } else {
                                    correquisitosParaAdicionar.push(matCorreq); 
                                }
                            }
                        }
                    });
                });
            }
            
            let creditosExtras = 0;
            correquisitosParaAdicionar.forEach(c => creditosExtras += c.creditos);
            
            if (isNewAdd && (creditosAtuais + creditosSendoArrastados + creditosExtras > MAX_CREDITS_PER_PERIOD)) {
                 alert(`Não há espaço suficiente para adicionar ${materia.codigo} e seus correquisitos (${correquisitosParaAdicionar.map(c=>c.codigo).join(',')}). Limite de 30 créditos excedido.`);
                 return;
            }

            const validacao = validarRegrasDeNegocio(materia, targetColumnId);

            if (!validacao.ok && validacao.motivo !== 'correq') {
                console.warn("DROP BLOQUEADO.");
                alert(validacao.msg);
                
                target.closest('.board-column').classList.add('drag-invalid-shake');
                setTimeout(() => target.closest('.board-column').classList.remove('drag-invalid-shake'), 500);
                return;
            }
            
            if (sourceType === 'card' && draggedItem) {
                target.appendChild(draggedItem);
            } else if (sourceType === 'pool') {
                const cardExistente = document.getElementById("card-" + codigoOriginal);
                if (cardExistente) {
                     target.appendChild(cardExistente); 
                } else { 
                    const tipo = draggedItem.classList.contains('pool-item-obrigatoria') ? 'obrigatoria' : 'optativa';
                    target.appendChild(createMateriaCard(materia, tipo));
                }
            }

            correquisitosParaAdicionar.forEach(matCorreq => {
                const cardExistente = document.getElementById("card-" + matCorreq.codigo);
                if (cardExistente) {
                    target.appendChild(cardExistente);
                } else {
                    target.appendChild(createMateriaCard(matCorreq, 'obrigatoria'));
                }
            });

            updateCreditCounters();
            processarEstadoDoBackend(); 
            validarBoardEmCascata();
            atualizarContadorCreditos();
        
        } else if (target.classList.contains('grid-dropzone')) {
            
            if (sourceType === 'grade-pool') {
                const materia = window.materiasData.find(m => m.codigo === codigoOriginal);
                if (materia) {
                    const newCard = createGradeCard(materia, draggedItem);
                    target.appendChild(newCard);
                    draggedItem.remove(); 
                }
            } else if (sourceType === 'grade-card') {
                target.appendChild(draggedItem);
            }
        
        } else if (target.classList.contains('pool-list')) {
            
            if (sourceType === 'card') {
                draggedItem.remove();
                filtrarPool();
                updateCreditCounters();
                processarEstadoDoBackend(); 
                validarBoardEmCascata();
            }
            
            else if (sourceType === 'grade-card') {
                const materia = window.materiasData.find(m => m.codigo === codigoOriginal);
                draggedItem.remove();
                if (materia) {
                    renderGradePoolItem(materia); 
                }
            }
        }
    });
}

function initializeDragAndDrop() {
    document.addEventListener('dragstart', event => {
        const target = event.target.closest('.pool-item, .materia-card, .grade-card');
        
        if (!target || target.classList.contains('pool-item-grupo')) {
            event.preventDefault();
            return;
        }
        
        let idOriginal = target.id;
        let codigoOriginal = '';
        
        if (idOriginal.startsWith('pool-item-')) {
            // Planner Pool
            codigoOriginal = idOriginal.replace('pool-item-', '');
            event.dataTransfer.setData('source-type', 'pool');
            event.dataTransfer.setData('source-column-id', 'pool');
        } else if (idOriginal.startsWith('grade-pool-item-')) {
            // Grade Pool
            codigoOriginal = target.dataset.codigoOriginal; 
            event.dataTransfer.setData('source-type', 'grade-pool');
        } else if (idOriginal.startsWith('card-')) {
            // Planner Card
            codigoOriginal = idOriginal.replace('card-', '');
            event.dataTransfer.setData('source-type', 'card');
            const sourceColumnEl = target.closest('.column-content');
            if (sourceColumnEl) {
                event.dataTransfer.setData('source-column-id', sourceColumnEl.dataset.columnId);
            }
        } else if (idOriginal.startsWith('grade-card-')) {
            // Grade Card
            codigoOriginal = target.dataset.codigo;
            event.dataTransfer.setData('source-type', 'grade-card');
        }
        
        event.dataTransfer.setData('materia-codigo-original', codigoOriginal);
        
        const materia = window.materiasData.find(m => m.codigo === codigoOriginal);
        event.dataTransfer.setData('materia-creditos', (materia ? materia.creditos : 0));

        target.dataset.credits = (materia ? materia.creditos : 0);
        target.dataset.codigoOriginal = codigoOriginal;

        setTimeout(() => target.classList.add('dragging'), 0);
    });

    document.addEventListener('dragend', () => {
        document.querySelector('.dragging')?.classList.remove('dragging');
        document.querySelectorAll('.drag-over, .drag-invalid').forEach(el => {
            el.classList.remove('drag-over');
            el.classList.remove('drag-invalid');
        });
    });
}

// --- Funções do Board (add/remove período) ---
function renumberPeriods() {
    const columns = document.querySelectorAll('#board-container .board-column:not(#column-p1)');
    let currentPeriod = 2;
    columns.forEach(column => {
        const newId = `p${currentPeriod}`;
        column.querySelector('.column-title').textContent = `${currentPeriod}º Período`;
        column.querySelector('.column-credit-counter').id = `credits-${newId}`;
        column.querySelector('.column-content').dataset.columnId = newId;
        column.id = `column-${newId}`;
        currentPeriod++;
    });
    periodCounter = currentPeriod;
}

function deletePeriod(event) {
    const column = event.target.closest('.board-column');
    if (!column) return;
    
    column.remove();
    renumberPeriods();
    updateCreditCounters();
    validarBoardEmCascata();
    atualizarContadorCreditos();
}

function addPeriodColumn() {
    const boardContainer = document.getElementById('board-container');
    const addButton = document.querySelector('.add-column-container');
    if (!boardContainer || !addButton) return;

    const columnId = `p${periodCounter}`;
    const newColumn = document.createElement('div');
    newColumn.className = 'board-column';
    newColumn.id = `column-${columnId}`;
    newColumn.innerHTML = `
        <div class="column-header">
          <h3 class="column-title">${periodCounter}º Período</h3>
          <div class="header-controls">
              <span class="column-credit-counter" id="credits-${columnId}">0 Créditos</span>
              <button class="delete-column-btn">
                  <i class="fas fa-times"></i>
              </button>
          </div>
        </div>
        <div class="column-content" data-column-id="${columnId}"></div>
    `;

    boardContainer.insertBefore(newColumn, addButton);
    addDragEventsToTarget(newColumn.querySelector('.column-content'));
    newColumn.querySelector('.delete-column-btn').addEventListener('click', deletePeriod);
    periodCounter++;
}

function initializeBoardControls() {
    document.getElementById('add-period-btn')?.addEventListener('click', addPeriodColumn);
}

function getMateriasCursadasAte(targetColumnId) {
    const cursadasSet = new Set();
    const targetPeriodNum = parseInt(targetColumnId.replace('p', ''), 10);

    for (let i = 1; i < targetPeriodNum; i++) {
        const colunaId = `column-p${i}`;
        const coluna = document.getElementById(colunaId);
        
        if (coluna) {
            coluna.querySelectorAll('.materia-card').forEach(card => {
                cursadasSet.add(card.dataset.codigo); // Usa o dataset que já existe
            });
        }
    }
    return cursadasSet;
}

function checkPrerequisitos(materia, cursadasSet) {
    if (!materia) return true;

    const prereqs_grupos = materia.prereqs_funcionais;

    if (!prereqs_grupos || prereqs_grupos.length === 0 || 
        (prereqs_grupos.length === 1 && prereqs_grupos[0].length === 0)) {
        return true;
    }

    for (const grupo_prereq of prereqs_grupos) {
        let grupoValido = true;
        
        for (const materia_prereq of grupo_prereq) {
            if (!cursadasSet.has(materia_prereq)) {
                grupoValido = false;
                break;
            }
        }
        if (grupoValido) return true;
    }
    return false;
}

// --- Lógica da Barra de Pesquisa ---
function filtrarPool() {
    const termo = normalizeText(document.getElementById('pool-search-input').value);
    const itens = document.querySelectorAll('#pool-list-container .pool-item, #pool-list-container .pool-item-grupo');
    
    itens.forEach(item => {
        // Pega o código original
        let idOriginal = item.id;
        let codigoOriginal = '';
        if (idOriginal.startsWith('pool-item-')) {
            codigoOriginal = idOriginal.replace('pool-item-', '');
        } else if (idOriginal.startsWith('grupo-')) {
            codigoOriginal = idOriginal.replace('grupo-', '');
        }

        // Esconde se já está no board
        const cardExistente = document.getElementById('card-' + codigoOriginal);
        if (cardExistente) {
            item.style.display = 'none';
            return;
        }

        // Pega os dados normalizados do dataset
        const codigo = item.dataset.codigo; // Já está normalizado
        const nome = item.dataset.nome;   // Já está normalizado
        
        if (termo === '' || (codigo && codigo.includes(termo)) || (nome && nome.includes(termo))) {
            item.style.display = 'flex'; // Mostra
        } else {
            item.style.display = 'none'; // Esconde
        }
    });
}

function initializePoolSearch() {
    const searchInput = document.getElementById('pool-search-input');
    if (searchInput) {
        searchInput.addEventListener('keyup', filtrarPool);
        searchInput.addEventListener('input', filtrarPool);
    }
}

// --- INICIALIZAÇÃO ---
function initializeApp() {
    loadComponent('componentes/header.html', 'header-placeholder');
    loadComponent('componentes/footer.html', 'footer-placeholder');

    initializeSidebar();
    initializePoolToggle();
    initializeModalControls();
    initializePoolSearch(); 
    initializeDragAndDrop();

    // --- Lógica Específica da Página ---
    const plannerBoard = document.getElementById('board-container');
    const gradeBoard = document.getElementById('grade-board');

    if (plannerBoard) {
        console.log("Modo: Planejador");
        initializePlannerPage();
    } else if (gradeBoard) {
        console.log("Modo: Grade Horária");
        initializeGradePage();
    }
}

function atualizarContadorCreditos() {
    const counterElement = document.getElementById('global-credit-counter');
    if (!counterElement) return;

    let totalPlanejado = 0;
    document.querySelectorAll('#board-container .materia-card').forEach(card => {
        const codigo = card.dataset.codigo;
        const mat = window.materiasData.find(m => m.codigo === codigo);
        if (mat) {
            totalPlanejado += mat.creditos;
        } else {
            const chipCred = card.querySelector('.card-chip.creditos');
            if(chipCred) totalPlanejado += parseInt(chipCred.textContent) || 0;
        }
    });

    let totalExigido = 0;
    
    if (window.estadoBackend) {
        if (window.estadoBackend.obrigatorias) {
            window.estadoBackend.obrigatorias.forEach(m => totalExigido += m.creditos);
        }
        
        if (window.estadoBackend.optativas_escolhidas) {
             window.estadoBackend.optativas_escolhidas.forEach(m => totalExigido += m.creditos);
        }
        
        if (window.estadoBackend.grupos_pendentes) {
             window.estadoBackend.grupos_pendentes.forEach(g => totalExigido += g.faltando);
        }
    }

    counterElement.innerText = `${totalPlanejado} / ${totalExigido}`;
    
    if (totalExigido > 0 && totalPlanejado >= totalExigido) {
        counterElement.classList.add('completed');
    } else {
        counterElement.classList.remove('completed');
    }
}

/**
 * Verifica se um código (ex: "INF0307") está satisfeito.
 * Retorna TRUE se:
 * 1. O código exato está no set (Ex: "ENG1234").
 * 2. O código é um GRUPO e alguma matéria desse grupo está no set.
 */
function requisitoEstaSatisfeito(codigoRequisito, setMaterias) {
    // 1. Checa direto
    if (setMaterias.has(codigoRequisito)) return true;

    // 2. Checa se é grupo
    if (window.dadosOptativas && window.dadosOptativas[codigoRequisito]) {
        const opcoes = window.dadosOptativas[codigoRequisito].Opções || [];
        // Se ALGUMA das opções do grupo estiver presente, tá valendo!
        return opcoes.some(opcaoCod => setMaterias.has(opcaoCod));
    }

    return false;
}

document.addEventListener("DOMContentLoaded", initializeApp);