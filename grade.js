// =========================================================
//  MENTOR GRADUS - GRADE.JS
//  Lógica específica da tela de Grade Horária
// =========================================================

function inicializarPaginaGrade() {
    console.log("📅 Iniciando Grade Horária...");
    
    // 1. Carrega dados globais
    carregarDadosIniciais().then(() => {
        
        // 2. Carrega o plano do aluno
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
    // ALVO CORRIGIDO: Agora buscamos a área da esquerda
    const containerSelecao = document.getElementById('periodos-selection');
    if (!containerSelecao) return;

    containerSelecao.innerHTML = ''; // Limpa anterior

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
            // Usa as classes de estilo que já existem no CSS
            chip.className = 'chip'; 
            chip.style.cursor = 'pointer';
            chip.style.marginBottom = '5px';
            chip.textContent = `${numero}º Período (${qtdMaterias})`;
            
            // Evento de Clique
            chip.addEventListener('click', () => {
                // 1. Visual: Marca este como selecionado e desmarca outros
                document.querySelectorAll('#periodos-selection .chip').forEach(c => {
                    c.classList.remove('chip-selected');
                    c.classList.add('chip'); // Garante estilo base
                    c.style.backgroundColor = '#f0f0f0'; // Cor padrão
                    c.style.color = '#333';
                });
                
                chip.classList.add('chip-selected'); // Estilo ativo (Verde)
                chip.classList.remove('chip'); // Remove base para não conflitar se necessário
                
                // 2. Atualiza Título da Direita
                const tituloDireita = document.querySelector('.pool-header h3');
                if(tituloDireita) tituloDireita.textContent = `Matérias do ${numero}º Período`;

                // 3. Gera os blocos na Direita
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
        const materia = window.dadosMaterias.find(m => m.codigo === codigo);
        if (!materia) return; 

        const creditos = materia.creditos || 2; 
        
        // Cria UM card para cada crédito
        for (let i = 1; i <= creditos; i++) {
            const bloco = document.createElement('div');
            
            bloco.className = 'grade-card pool-item'; 
            
            // Estilo visual do bloquinho
            bloco.style.padding = "6px 8px";
            bloco.style.margin = "4px 0";
            bloco.style.cursor = "grab";
            bloco.style.borderLeft = "4px solid #1abc9c"; 
            bloco.style.backgroundColor = "white";
            bloco.style.boxShadow = "0 1px 2px rgba(0,0,0,0.1)";
            bloco.style.fontSize = "0.8rem";
            
            // Configuração Drag & Drop
            bloco.draggable = true;
            bloco.dataset.codigoOriginal = materia.codigo;
            bloco.id = `grade-block-${materia.codigo}-${i}`; 

            bloco.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong style="color:#333;">${materia.codigo}</strong>
                    <span style="font-size:0.7em; color:#888; font-weight:bold; background:#eee; padding:1px 4px; border-radius:4px;">${i}/${creditos}</span>
                </div>
                <div style="font-size:0.75em; color:#555; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px;">
                    ${materia.nome}
                </div>
            `;

            container.appendChild(bloco);
        }
    });
}