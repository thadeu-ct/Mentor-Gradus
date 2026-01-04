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

    containerSelecao.innerHTML = ''; 

    // Ordena os períodos numericamente
    const periodosOrdenados = Object.keys(boardSalvo).sort((a,b) => {
        return parseInt(a.replace('p','')) - parseInt(b.replace('p',''));
    });

    if (periodosOrdenados.length === 0) {
        containerSelecao.innerHTML = '<p style="padding:10px; color:#666;">Nenhum período planejado.</p>';
        return;
    }

    periodosOrdenados.forEach(idCol => {
        const numero = idCol.replace('p', '');
        const listaMaterias = boardSalvo[idCol];
        const qtdMaterias = listaMaterias.length;
        
        // --- CÁLCULO DE CRÉDITOS DO PERÍODO ---
        let totalCreditos = 0;
        listaMaterias.forEach(cod => {
            const mat = window.dadosMaterias.find(m => m.codigo === cod);
            if (mat) totalCreditos += (mat.creditos || 0);
        });

        // Só mostra se tiver matérias (ou se quiser mostrar vazios, remova o if)
        if (qtdMaterias > 0) {
            const chip = document.createElement('div');
            
            chip.className = 'chip period-list-item'; // Adicionei uma classe extra para estilizar
            chip.dataset.periodo = idCol;
            
            // HTML interno para separar Nome (Esq) e Detalhes (Dir)
            chip.innerHTML = `
                <span class="period-name">${numero}º Período</span>
                <span class="period-info">${qtdMaterias} Mat. (${totalCreditos} Cr.)</span>
            `;
            
            chip.addEventListener('click', () => {
                // 1. Reseta seleção visual
                const todosChips = containerSelecao.querySelectorAll('.chip');
                todosChips.forEach(c => c.classList.remove('chip-selected'));

                // 2. Seleciona o atual
                chip.classList.add('chip-selected');

                // 3. Atualiza Título
                const tituloDireita = document.querySelector('.pool-header h3');
                if(tituloDireita) tituloDireita.textContent = `Matérias do ${numero}º Período`;

                // 4. Gera os blocos
                gerarBlocosDeCreditos(listaMaterias);
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

        // Verifica tipo para cor da barra
        let classeTipo = 'obrigatoria';
        if (window.estadoBackend && window.estadoBackend.optativas_escolhidas) {
             const ehOptativa = window.estadoBackend.optativas_escolhidas.some(m => m.codigo === codigo);
             if (ehOptativa) classeTipo = 'optativa';
        }

        while (creditosRestantes > 0) {
            const tamanhoBloco = (creditosRestantes >= 2) ? 2 : 1;
            
            const bloco = document.createElement('div');
            
            // Adiciona classes: Base, Tipo (cor) e Tamanho (pequeno ou normal)
            bloco.className = `grade-card pool-item ${classeTipo}`; 
            
            if (tamanhoBloco === 1) {
                bloco.classList.add('grade-card-small'); // CSS vai tratar isso dependendo de onde estiver
            }
            
            // REMOVIDO: bloco.style.height = ... (Deixe o CSS cuidar disso!)
            
            bloco.style.cursor = "grab";
            bloco.draggable = true;
            bloco.dataset.codigoOriginal = materia.codigo;
            bloco.dataset.tamanho = tamanhoBloco;
            bloco.id = `grade-block-${materia.codigo}-${contadorBloco}`; 

            const badgeTexto = `${tamanhoBloco}h`;

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

            container.appendChild(bloco);

            creditosRestantes -= tamanhoBloco;
            contadorBloco++;
        }
    });
}