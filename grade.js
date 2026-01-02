// =========================================================
//  MENTOR GRADUS - GRADE.JS
//  Lógica específica da tela de Grade Horária
// =========================================================

function inicializarPaginaGrade() {
    console.log("📅 Iniciando Grade Horária...");
    
    // 1. Carrega dados globais (Matérias, Nomes, etc.)
    // (A função carregarDadosIniciais está no app.js e é global)
    carregarDadosIniciais().then(() => {
        
        // 2. Carrega o plano do aluno do LocalStorage
        const salvo = localStorage.getItem('mentorGradus_Estado');
        if (!salvo) {
            alert("Nenhum planejamento encontrado. Monte sua grade no Planner primeiro!");
            return;
        }
        const dadosPlano = JSON.parse(salvo);

        // 3. Monta o Seletor de Período na Sidebar
        configurarSidebarGrade(dadosPlano.board);

        // 4. Ativa o Drag & Drop nas células da tabela
        // (A função adicionarEventosDeArrasto também está no app.js)
        document.querySelectorAll('.grid-dropzone').forEach(celula => {
            adicionarEventosDeArrasto(celula);
        });
    });
}

function configurarSidebarGrade(boardSalvo) {
    const poolHeader = document.querySelector('.pool-header');
    if (!poolHeader) return;

    // Substitui o header padrão por um Seletor
    poolHeader.innerHTML = `
        <div style="width:100%;">
            <h3 style="margin-bottom:10px; color:#2c3e50;">Montar Grade</h3>
            <select id="grade-periodo-select" style="width:100%; padding:8px; border-radius:4px; border:1px solid #ccc; background:white;">
                <option value="">Selecione um Período...</option>
            </select>
        </div>
    `;

    const select = document.getElementById('grade-periodo-select');
    
    // Popula o select com os períodos que têm matérias salvas
    Object.keys(boardSalvo)
        .sort((a,b) => parseInt(a.replace('p','')) - parseInt(b.replace('p',''))) // Ordena p1, p2...
        .forEach(idCol => {
            const numero = idCol.replace('p', '');
            const qtdMaterias = boardSalvo[idCol].length;
            
            // Só mostra períodos que tenham conteúdo
            if (qtdMaterias > 0) {
                const option = document.createElement('option');
                option.value = idCol;
                option.textContent = `${numero}º Período (${qtdMaterias} matérias)`;
                select.appendChild(option);
            }
        });

    // Evento: Quando trocar o período, gera os bloquinhos
    select.addEventListener('change', (e) => {
        const idPeriodo = e.target.value;
        if (idPeriodo) {
            gerarBlocosDeCreditos(boardSalvo[idPeriodo]);
        } else {
            document.getElementById('pool-list-container').innerHTML = '';
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

        // Se não tiver créditos definidos, assume 2 por segurança, mas o ideal é ter no JSON
        const creditos = materia.creditos || 2; 
        
        // Cria UM card para cada crédito (Ex: Matéria de 4 créditos = 4 cards de 1h)
        for (let i = 1; i <= creditos; i++) {
            const bloco = document.createElement('div');
            
            // Reutiliza classes do pool para layout, mas adiciona estilo específico
            bloco.className = 'grade-card pool-item'; 
            
            // Estilização inline para diferenciar dos cards do planner (pode ir pro CSS depois)
            bloco.style.padding = "8px";
            bloco.style.margin = "5px 0";
            bloco.style.cursor = "grab";
            bloco.style.borderLeft = "4px solid #1abc9c"; // Verde água
            bloco.style.backgroundColor = "white";
            bloco.style.boxShadow = "0 1px 2px rgba(0,0,0,0.1)";
            
            // Configuração para Drag & Drop
            bloco.draggable = true;
            bloco.dataset.codigoOriginal = materia.codigo;
            bloco.id = `grade-block-${materia.codigo}-${i}`; // ID único para cada bloquinho

            // Conteúdo visual (Código + Índice/Total)
            bloco.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong style="font-size:0.85rem; color:#333;">${materia.codigo}</strong>
                    <span style="font-size:0.7rem; color:#888; font-weight:bold;">${i}/${creditos}</span>
                </div>
                <div style="font-size:0.75rem; color:#555; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px;">
                    ${materia.nome}
                </div>
            `;

            container.appendChild(bloco);
        }
    });
}