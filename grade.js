// =========================================================
//  MENTOR GRADUS - GRADE.JS
//  Lógica específica da tela de Grade Horária
// =========================================================

function inicializarPaginaGrade() {
    console.log("📅 Iniciando Grade Horária...");
    
    // 1. Carrega dados globais (Matérias, Nomes, etc.)
    carregarDadosIniciais().then(() => {
        
        // 2. Carrega o plano do aluno do LocalStorage
        const salvo = localStorage.getItem('mentorGradus_Estado');
        if (!salvo) {
            alert("Nenhum planejamento encontrado. Monte sua grade no Planner primeiro!");
            return;
        }
        const dadosPlano = JSON.parse(salvo);

        // 3. Monta a lista de períodos na Esquerda
        configurarSidebarGrade(dadosPlano.board);

        // 4. Ativa o Drag & Drop nas células da tabela
        document.querySelectorAll('.grid-dropzone').forEach(celula => {
            adicionarEventosDeArrasto(celula);
        });
    });
}

function configurarSidebarGrade(boardSalvo) {
    const containerSelecao = document.getElementById('periodos-selection');
    if (!containerSelecao) return;

    containerSelecao.innerHTML = ''; // Limpa lista anterior

    // Ordena os períodos (p1, p2, p3...)
    const periodosOrdenados = Object.keys(boardSalvo).sort((a,b) => {
        return parseInt(a.replace('p','')) - parseInt(b.replace('p',''));
    });

    periodosOrdenados.forEach(idCol => {
        const numero = idCol.replace('p', '');
        const qtdMaterias = boardSalvo[idCol].length;
        
        // Só cria botão se tiver matérias
        if (qtdMaterias > 0) {
            const chip = document.createElement('div');
            
            // Estado Inicial: Classe 'chip' (Cinza, clicável)
            chip.className = 'chip'; 
            chip.textContent = `${numero}º Período (${qtdMaterias})`;
            chip.dataset.periodo = idCol;
            
            // Evento de Clique
            chip.addEventListener('click', () => {
                // 1. Reseta TODOS os chips para o estado cinza (.chip)
                const todosChips = containerSelecao.querySelectorAll('div');
                todosChips.forEach(c => {
                    c.className = 'chip'; // Volta a ser cinza
                });

                // 2. Define o clicado como selecionado (.chip-selected)
                chip.className = 'chip-selected'; // Fica verde

                // 3. Atualiza Título da Direita
                const tituloDireita = document.querySelector('.pool-header h3');
                if(tituloDireita) tituloDireita.textContent = `Matérias do ${numero}º Período`;

                // 4. Gera os blocos na Direita
                gerarBlocosDeCreditos(boardSalvo[idCol]);
            });

            containerSelecao.appendChild(chip);
        }
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

        while (creditosRestantes > 0) {
            // Regra: Tenta pegar um bloco de 2h. Se só sobrar 1h, pega 1h.
            const tamanhoBloco = (creditosRestantes >= 2) ? 2 : 1;
            
            const bloco = document.createElement('div');
            bloco.className = 'grade-card pool-item'; 
            
            // --- NOVA LÓGICA DE TAMANHO ---
            // Se o bloco é de 2h (2 créditos), ele ocupa a célula cheia (80px)
            // Se o bloco é de 1h (1 crédito), ele ocupa metade (40px)
            if (tamanhoBloco === 2) {
                bloco.style.height = "80px"; 
            } else {
                bloco.style.height = "40px";
                // Ajuste visual extra para o bloco pequeno não ficar apertado
                bloco.classList.add('grade-card-small'); 
            }
            
            bloco.style.cursor = "grab";
            bloco.draggable = true;
            bloco.dataset.codigoOriginal = materia.codigo;
            bloco.dataset.tamanho = tamanhoBloco;
            bloco.id = `grade-block-${materia.codigo}-${contadorBloco}`; 

            const badgeTexto = `${tamanhoBloco}h`;

            bloco.innerHTML = `
                <div class="grade-card-header">
                    <strong>${materia.codigo}</strong>
                    <span class="credit-badge">${badgeTexto}</span>
                </div>
                <div class="grade-card-name" title="${materia.nome}">
                    ${materia.nome}
                </div>
            `;

            container.appendChild(bloco);

            creditosRestantes -= tamanhoBloco;
            contadorBloco++;
        }
    });
}