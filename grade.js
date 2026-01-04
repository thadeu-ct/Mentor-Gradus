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
    container.innerHTML = ''; // Limpa a lista

    listaCodigos.forEach(codigo => {
        // Busca os dados da matéria no cache global
        const materia = window.dadosMaterias.find(m => m.codigo === codigo);
        if (!materia) return; 

        const creditos = materia.creditos || 2; 
        
        // Cria UM card para cada crédito
        for (let i = 1; i <= creditos; i++) {
            const bloco = document.createElement('div');
            
            // Reutiliza classes do pool para layout + classe específica da grade
            bloco.className = 'grade-card pool-item'; 
            
            // --- ATUALIZAÇÃO: REMOVIDOS ESTILOS MANUAIS ---
            // Deixamos o style.css controlar tudo para ficar bonito e consistente.
            // Apenas definimos o cursor para garantir a usabilidade.
            bloco.style.cursor = "grab";
            
            // Configuração Drag & Drop
            bloco.draggable = true;
            bloco.dataset.codigoOriginal = materia.codigo;
            bloco.id = `grade-block-${materia.codigo}-${i}`; 

            // --- ATUALIZAÇÃO: HTML INTERNO REFINADO ---
            // Usa as classes do CSS novo para alinhar (Código na esq, Badge na dir)
            bloco.innerHTML = `
                <div class="grade-card-header">
                    <strong>${materia.codigo}</strong>
                    <span class="credit-badge">${i}/${creditos}</span>
                </div>
                <div class="grade-card-name" title="${materia.nome}">
                    ${materia.nome}
                </div>
            `;

            container.appendChild(bloco);
        }
    });
}