// =========================================================
//  MENTOR GRADUS - GRADE.JS
//  Lógica específica da tela de Grade Horária
// =========================================================

let periodoSelecionadoId = null; // Guarda qual período estamos mexendo agora (ex: "p1")

function inicializarPaginaGrade() {
    console.log("📅 Iniciando Grade Horária...");
    
    carregarDadosIniciais().then(() => {
        const salvo = localStorage.getItem('mentorGradus_Estado');
        if (!salvo) {
            alert("Nenhum planejamento encontrado. Monte sua grade no Planner primeiro!");
            return;
        }
        const dadosPlano = JSON.parse(salvo);

        // Configura a Sidebar com os períodos disponíveis
        configurarSidebarGrade(dadosPlano.board);

        // Ativa o Drag & Drop nas células da tabela (Grade e Online)
        const dropzones = document.querySelectorAll('.grid-dropzone, #online-dropzone');
        dropzones.forEach(celula => {
            adicionarEventosDeArrastoGrade(celula);
        });
    });
}

function configurarSidebarGrade(boardSalvo) {
    const containerSelecao = document.getElementById('periodos-selection');
    if (!containerSelecao) return;

    containerSelecao.innerHTML = ''; 

    // Ordena os períodos (p1, p2, p3...)
    const periodosOrdenados = Object.keys(boardSalvo).sort((a,b) => {
        return parseInt(a.replace('p','')) - parseInt(b.replace('p',''));
    });

    periodosOrdenados.forEach(idCol => {
        const numero = idCol.replace('p', '');
        const listaMaterias = boardSalvo[idCol]; // Lista de códigos (ex: ['ENG1234', ...])
        
        // Contagem de Créditos para o Label
        let totalCreditos = 0;
        listaMaterias.forEach(cod => {
            const mat = window.dadosMaterias.find(m => m.codigo === cod);
            if (mat) totalCreditos += (mat.creditos || 0);
        });

        if (listaMaterias.length > 0) {
            const chip = document.createElement('div');
            chip.className = 'chip'; 
            
            // HTML bonito da Sidebar
            chip.innerHTML = `
                <span class="period-name">${numero}º Período</span>
                <span class="period-info">${listaMaterias.length} Mat. (${totalCreditos} Cr.)</span>
            `;
            chip.dataset.periodo = idCol;
            
            chip.addEventListener('click', () => {
                // 1. Destaque Visual
                const todosChips = containerSelecao.querySelectorAll('.chip');
                todosChips.forEach(c => c.classList.remove('chip-selected'));
                chip.classList.add('chip-selected');

                // 2. Atualiza Variável Global
                periodoSelecionadoId = idCol;

                // 3. Título da Direita
                const tituloDireita = document.querySelector('.pool-header h3');
                if(tituloDireita) tituloDireita.textContent = `Matérias do ${numero}º Período`;

                // 4. RESET TOTAL: Limpa Grade e Pool antes de carregar o novo
                limparGradeVisualmente();

                // 5. Gera os blocos no Pool (inicialmente tudo vai pro Pool)
                gerarBlocosDeCreditos(listaMaterias);

                // 6. MÁGICA: Move do Pool para a Grade conforme memória salva
                restaurarPosicoesGrade(idCol);
            });

            containerSelecao.appendChild(chip);
        }
    });
}

// Limpa todos os cards da grade para não misturar períodos
function limparGradeVisualmente() {
    // Seleciona todas as áreas de drop (células de horário + online)
    const areas = document.querySelectorAll('.grid-dropzone, #online-dropzone');
    areas.forEach(area => {
        area.innerHTML = ''; // Remove todos os cards filhos
    });
}

function gerarBlocosDeCreditos(listaCodigos) {
    const container = document.getElementById('pool-list-container');
    container.innerHTML = ''; 

    listaCodigos.forEach(codigo => {
        const materia = window.dadosMaterias.find(m => m.codigo === codigo);
        if (!materia) return; 

        let creditosRestantes = materia.creditos || 2; 
        let contadorBloco = 1;

        // Cor da barra (Obrigatória/Optativa)
        let classeTipo = 'obrigatoria';
        if (window.estadoBackend && window.estadoBackend.optativas_escolhidas) {
             const ehOptativa = window.estadoBackend.optativas_escolhidas.some(m => m.codigo === codigo);
             if (ehOptativa) classeTipo = 'optativa';
        }

        while (creditosRestantes > 0) {
            const tamanhoBloco = (creditosRestantes >= 2) ? 2 : 1;
            
            const bloco = document.createElement('div');
            bloco.className = `grade-card pool-item ${classeTipo}`; 
            
            if (tamanhoBloco === 1) {
                bloco.classList.add('grade-card-small'); 
            }
            
            bloco.style.cursor = "grab";
            bloco.draggable = true;
            // ID Único Determinístico: Necessário para salvar/carregar posição
            bloco.id = `gb-${materia.codigo}-${contadorBloco}`; 
            
            bloco.dataset.codigoOriginal = materia.codigo;
            bloco.dataset.tamanho = tamanhoBloco;

            const badgeTexto = `${tamanhoBloco}h`;

            // HTML Interno (Barra, Código, Nome)
            bloco.innerHTML = `
                <div class="grade-card-bar"></div>
                <div class="grade-card-content">
                    <div class="grade-card-code">
                        <span>${materia.codigo}</span>
                        <span class="grade-card-chip">${badgeTexto}</span>
                    </div>
                    <div class="grade-card-name" title="${materia.nome}">
                        ${materia.nome}
                    </div>
                </div>
            `;
            
            // Adiciona evento DragStart específico para grade
            bloco.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('block-id', bloco.id);
                bloco.classList.add('dragging');
            });

            bloco.addEventListener('dragend', () => {
                bloco.classList.remove('dragging');
                document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            });

            container.appendChild(bloco);

            creditosRestantes -= tamanhoBloco;
            contadorBloco++;
        }
    });
}

// --- LÓGICA DE PERSISTÊNCIA DA GRADE ---

function salvarPosicoesGrade() {
    if (!periodoSelecionadoId) return;

    const mapaPosicoes = {};

    // 1. Varre todas as células de tempo (ex: Segunda 07:00)
    document.querySelectorAll('.grid-cell.grid-dropzone').forEach(celula => {
        const dia = celula.dataset.day;
        const hora = celula.dataset.time;
        const chavePosicao = `${dia}-${hora}`; // ex: "seg-07"
        
        // Pega os IDs dos blocos dentro desta célula
        const blocos = Array.from(celula.querySelectorAll('.grade-card')).map(el => el.id);
        if (blocos.length > 0) {
            mapaPosicoes[chavePosicao] = blocos;
        }
    });

    // 2. Varre a área Online
    const onlineZone = document.getElementById('online-dropzone');
    if (onlineZone) {
        const blocosOnline = Array.from(onlineZone.querySelectorAll('.grade-card')).map(el => el.id);
        if (blocosOnline.length > 0) {
            mapaPosicoes['online'] = blocosOnline;
        }
    }

    // 3. Salva no LocalStorage unificado
    // Estrutura: { "p1": { "seg-07": ["gb-MAT1-1"], "online": [] }, "p2": ... }
    const memoriaGrade = JSON.parse(localStorage.getItem('mentorGradus_GradePositions') || '{}');
    memoriaGrade[periodoSelecionadoId] = mapaPosicoes;
    
    localStorage.setItem('mentorGradus_GradePositions', JSON.stringify(memoriaGrade));
    // console.log(`💾 Grade do ${periodoSelecionadoId} salva.`);
}

function restaurarPosicoesGrade(periodoId) {
    const memoriaRaw = localStorage.getItem('mentorGradus_GradePositions');
    if (!memoriaRaw) return;

    const memoriaTotal = JSON.parse(memoriaRaw);
    const posicoesDoPeriodo = memoriaTotal[periodoId]; // ex: { "seg-07": ["gb-MAT1-1"] }

    if (!posicoesDoPeriodo) return; // Nada salvo para este período

    // Itera sobre as posições salvas (ex: "seg-07", "online")
    Object.keys(posicoesDoPeriodo).forEach(chavePosicao => {
        let dropzoneDestino;

        if (chavePosicao === 'online') {
            dropzoneDestino = document.getElementById('online-dropzone');
        } else {
            const [dia, hora] = chavePosicao.split('-');
            dropzoneDestino = document.querySelector(`.grid-dropzone[data-day="${dia}"][data-time="${hora}"]`);
        }

        if (dropzoneDestino) {
            const listaIdsBlocos = posicoesDoPeriodo[chavePosicao]; // ["gb-MAT1-1", "gb-MAT1-2"]
            
            listaIdsBlocos.forEach(idBloco => {
                // Procura o elemento que foi gerado no Pool
                const bloco = document.getElementById(idBloco);
                if (bloco) {
                    // Move do Pool para a Grade
                    dropzoneDestino.appendChild(bloco);
                }
            });
        }
    });
}


// --- LÓGICA DE DRAG & DROP DA GRADE ---

// --- LÓGICA DE DRAG & DROP DA GRADE (ATUALIZADA) ---

function adicionarEventosDeArrastoGrade(alvo) {
    alvo.addEventListener('dragover', e => {
        e.preventDefault();
        alvo.classList.add('drag-over');
    });

    alvo.addEventListener('dragleave', () => {
        alvo.classList.remove('drag-over');
    });

    alvo.addEventListener('drop', e => {
        e.preventDefault();
        alvo.classList.remove('drag-over');

        const blockId = e.dataTransfer.getData('block-id');
        const draggedItem = document.getElementById(blockId);
        
        if (draggedItem) {
            // --- NOVA LÓGICA DE POSICIONAMENTO (CIMA / BAIXO) ---
            
            // 1. Detecta altura da célula e onde o mouse soltou
            const rect = alvo.getBoundingClientRect();
            const mouseY = e.clientY - rect.top; // Posição Y relativa à célula
            const isBottomHalf = mouseY > (rect.height / 2); // Passou da metade?

            // 2. Regra: Só permite escolher alinhamento se a célula estiver VAZIA
            // (Se já tem um card, o Flexbox empilha um em cima do outro naturalmente)
            if (alvo.children.length === 0) {
                // Se o card for pequeno (1h) e soltou embaixo -> Aplica classe
                if (draggedItem.dataset.tamanho == "1" && isBottomHalf) {
                    draggedItem.classList.add('bottom-aligned');
                } else {
                    draggedItem.classList.remove('bottom-aligned');
                }
            } else {
                // Se já tem gente na célula, remove alinhamentos forçados para empilhar bonitinho
                draggedItem.classList.remove('bottom-aligned');
                Array.from(alvo.children).forEach(filho => filho.classList.remove('bottom-aligned'));
            }

            alvo.appendChild(draggedItem);
            
            // Salva imediatamente após soltar!
            salvarPosicoesGrade();
        }
    });
}

// --- LÓGICA DE PERSISTÊNCIA DA GRADE (ATUALIZADA) ---

function salvarPosicoesGrade() {
    if (!periodoSelecionadoId) return;

    const mapaPosicoes = {};

    // 1. Varre todas as células de tempo
    document.querySelectorAll('.grid-cell.grid-dropzone').forEach(celula => {
        const dia = celula.dataset.day;
        const hora = celula.dataset.time;
        const chavePosicao = `${dia}-${hora}`;
        
        // --- MODIFICAÇÃO: Salva o alinhamento junto com o ID ---
        const blocos = Array.from(celula.querySelectorAll('.grade-card')).map(el => {
            // Se tiver a classe bottom-aligned, salva com sufixo "::bottom"
            if (el.classList.contains('bottom-aligned')) {
                return `${el.id}::bottom`;
            }
            return el.id;
        });

        if (blocos.length > 0) {
            mapaPosicoes[chavePosicao] = blocos;
        }
    });

    // 2. Varre a área Online (Sem mudanças aqui, online não tem Cima/Baixo)
    const onlineZone = document.getElementById('online-dropzone');
    if (onlineZone) {
        const blocosOnline = Array.from(onlineZone.querySelectorAll('.grade-card')).map(el => el.id);
        if (blocosOnline.length > 0) {
            mapaPosicoes['online'] = blocosOnline;
        }
    }

    const memoriaGrade = JSON.parse(localStorage.getItem('mentorGradus_GradePositions') || '{}');
    memoriaGrade[periodoSelecionadoId] = mapaPosicoes;
    
    localStorage.setItem('mentorGradus_GradePositions', JSON.stringify(memoriaGrade));
}

function restaurarPosicoesGrade(periodoId) {
    const memoriaRaw = localStorage.getItem('mentorGradus_GradePositions');
    if (!memoriaRaw) return;

    const memoriaTotal = JSON.parse(memoriaRaw);
    const posicoesDoPeriodo = memoriaTotal[periodoId];

    if (!posicoesDoPeriodo) return;

    Object.keys(posicoesDoPeriodo).forEach(chavePosicao => {
        let dropzoneDestino;

        if (chavePosicao === 'online') {
            dropzoneDestino = document.getElementById('online-dropzone');
        } else {
            const [dia, hora] = chavePosicao.split('-');
            dropzoneDestino = document.querySelector(`.grid-dropzone[data-day="${dia}"][data-time="${hora}"]`);
        }

        if (dropzoneDestino) {
            const listaIdsBlocos = posicoesDoPeriodo[chavePosicao];
            
            listaIdsBlocos.forEach(idString => {
                // --- MODIFICAÇÃO: Lê o sufixo e reaplica a classe ---
                const isBottom = idString.endsWith('::bottom');
                const realId = isBottom ? idString.split('::')[0] : idString;

                const bloco = document.getElementById(realId);
                if (bloco) {
                    if (isBottom) {
                        bloco.classList.add('bottom-aligned');
                    } else {
                        bloco.classList.remove('bottom-aligned');
                    }
                    dropzoneDestino.appendChild(bloco);
                }
            });
        }
    });
}

// Permite arrastar de volta para o Pool (remover da grade)
const poolContainer = document.getElementById('pool-list-container');
if (poolContainer) {
    poolContainer.addEventListener('dragover', e => {
        e.preventDefault();
        poolContainer.classList.add('drag-over');
    });
    
    poolContainer.addEventListener('dragleave', () => poolContainer.classList.remove('drag-over'));
    
    poolContainer.addEventListener('drop', e => {
        e.preventDefault();
        poolContainer.classList.remove('drag-over');
        const blockId = e.dataTransfer.getData('block-id');
        const draggedItem = document.getElementById(blockId);
        if (draggedItem) {
            poolContainer.appendChild(draggedItem); // Devolve pra lista
            salvarPosicoesGrade(); // Atualiza a memória (removeu da grade)
        }
    });
}