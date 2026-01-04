// =========================================================
//  MENTOR GRADUS - APP.JS
// =========================================================

// --- Estado Global (Variáveis que guardam os dados do sistema) ---
window.dadosMaterias = [];       // Lista simples com todas as matérias (antigo materiasData)
window.materiasProcessadas = []; // Dados PROCESSADO (Com substituições feitas pela lógica A/B/C)
window.dadosOptativas = {};      // Definições de grupos de optativas
window.dadosFormacoes = {};      // Definições dos cursos (Eng. Computação, etc.)
window.dadosDominios = {};       // Definições dos domínios adicionais
window.estadoBackend = null;     // O que o Python mandou cursar (Obrigatórias + Escolhas)

// Controle do Board (Variáveis de controle da interface)
let contadorPeriodos = 2;
const MAX_CRED_PERIODO = 30;

// =========================================================
// 1. INICIALIZAÇÃO
// =========================================================

// Quando o navegador terminar de carregar o HTML, inicie a aplicação
document.addEventListener("DOMContentLoaded", iniciarMentorGradus);

function iniciarMentorGradus() {
    // Carrega arquivos HTML externos (header e footer)
    carregarComponente('componentes/header.html', 'header-placeholder');
    carregarComponente('componentes/footer.html', 'footer-placeholder');

    // Inicializa controles da interface
    inicializarSidebar();        // Menu lateral esquerdo
    inicializarTogglePool();     // Menu lateral direito (Pool)
    inicializarControlesModal(); // Janelas pop-up
    inicializarBuscaPool();      // Barra de pesquisa
    inicializarArrastarSoltar(); // Movimentações dos cards

    // 3. Verifica em qual página está
    const plannerBoard = document.getElementById('board-container');
    const grafoContainer = document.getElementById('cy');

    if (plannerBoard) {
        inicializarPaginaPlanner();
    } else if (gradeBoard) {
        inicializarPaginaGrade();
    } else if (grafoContainer) {
        inicializarPaginaGrafoApp();
    }
}

// Função genérica para carregar componentes HTML (Header/Footer)
function carregarComponente(url, idElemento) {
    fetch(url)
        .then(resposta => { // se resposta ok ? (sim) texto : (não) erro
            return resposta.ok ? resposta.text() : Promise.reject(resposta.statusText);
        })
        .then(conteudoHTML => {
            const elemento = document.getElementById(idElemento);
            if (elemento) {
                elemento.innerHTML = conteudoHTML;
            }
        })
        .catch(erro => console.error("Erro ao carregar componente:", erro));
}

// Função principal que prepara os dados do Planner
function inicializarPaginaPlanner() {
    //Carrega os JSONs para compor os dados
    carregarDadosIniciais().then(() => {
        inicializarSeletoresDeChips(); // Configura botões de seleção de curso (Dom, Form, Enf)
        inicializarControlesDoBoard(); // Configura botão de "Adicionar Período"
        
        // Adiciona a lógica de arrastar nas colunas que já existem (Período 1 e Pool)
        const areasArrastaveis = document.querySelectorAll('.column-content, .pool-list');
        areasArrastaveis.forEach(area => adicionarEventosDeArrasto(area));
        
        carregarBoardLocal();

        // Inicia processo de captação das matérias
        processarEstadoDoBackend(); 
    });
}

function inicializarPaginaGrafoApp() {
    console.log("🕸️ Iniciando Página de Grafo...");
    carregarDadosIniciais().then(() => {
        inicializarSeletoresDeChips(); // Ativa os botões da sidebar
        
        // Restaura as seleções (Eng. Computação, etc.) do localStorage
        carregarBoardLocal();

        // Se o grafo.js já carregou, forçamos o primeiro desenho
        if (typeof atualizarGrafo === 'function') {
            atualizarGrafo();
        }
    });
}

// Busca os dados JSON do servidor (Python ou Arquivos Estáticos)
async function carregarDadosIniciais() {
    try {
        // Agora carregamos TAMBÉM o catálogo completo de matérias (materias.json)
        const [formacoes, dominios, optativas, materias] = await Promise.all([
            fetch('/api/get-dados-formacoes').then(r => r.json()),
            fetch('/api/get-dados-dominios').then(r => r.json()),
            fetch('/api/get-dados-optativas').then(r => r.json()),
            fetch('/api/get-dados-materias').then(r => r.json())
        ]);

        window.dadosFormacoes = formacoes;
        window.dadosDominios = dominios;
        window.dadosOptativas = optativas;
        window.dadosMaterias = materias;

        popularDropdown('#formacoes-options', Object.keys(formacoes));
        popularDropdown('#dominios-options', Object.keys(dominios));

    } catch (erro) {
        console.error("Erro fatal carregando dados:", erro);
        alert("Erro ao carregar dados. Verifique se o 'materias.json' está na pasta correta.");
    }
}

// ==============================================================
//  Parte 2: Comunicação com Backend & Lógica de Filas (A/B/C)
// ==============================================================

// Função chamada sempre que o usuário muda uma seleção ou move um card
function processarEstadoDoBackend(materiaManual = null) {
    // Pega o que o usuário selecionou na tela
    const formacoes = pegarValoresSelecionados("#formacoes-selection");
    const dominios = pegarValoresSelecionados("#dominios-selection");
    
    const enfaseChip = document.querySelector("#enfase-selection .chip-selected");
    const enfase = enfaseChip ? enfaseChip.dataset.value : null;
    
    // Pega matérias dos periodos já selecionadas
    const materiasNoBoard = pegarMateriasNoBoard(); 
    if (materiaManual && !materiasNoBoard.includes(materiaManual)) {
        materiasNoBoard.push(materiaManual);
    }

    // Prepara o pacote de dados para enviar ao Python
    const dadosParaEnvio = { 
        formacoes: formacoes, 
        dominios: dominios, 
        enfase_escolhida: enfase, 
        pre_selecionadas: materiasNoBoard 
    };

    // Consulta o Python | quais materias ainda é preciso ser feito
    fetch('/api/processar-estado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dadosParaEnvio)
    })
    .then(resposta => resposta.json())
    .then(estadoRecebido => {
        // Salva o retorno do Python na variável global
        window.estadoBackend = estadoRecebido;
        
        limparMateriasExcedentes();

        // Guarda as informações detalhadas das matérias no cache global
        estadoRecebido.obrigatorias.forEach(adicionarMateriaAoCache);
        estadoRecebido.optativas_escolhidas.forEach(adicionarMateriaAoCache);

        // 3. Executa o algoritmo inteligente de organização
        hidratarBoard();
        recalcularFilasABC();
        salvarBoardLocal();
    })
    .catch(erro => console.error("Erro ao processar estado:", erro));
}

// Função auxiliar para guardar matérias no cache global
function adicionarMateriaAoCache(materia) {
    // Só adiciona se ainda não existir na lista
    if (!window.dadosMaterias.find(m => m.codigo === materia.codigo)) {
        window.dadosMaterias.push(materia);
    }
}

// =========================================================
// 3. O ALGORITMO DE FILAS (Lógica A/B/C)
// =========================================================

function recalcularFilasABC() {
    if (!window.estadoBackend) return;

    // --- Passo 0.1: Calcular Créditos Totais no Board ---
    // Precisamos saber quanto o aluno já planejou para aplicar a regra de 'min-cred'
    let creditosTotaisNoBoard = 0;
    const codigosNoBoard = pegarMateriasNoBoard();
    codigosNoBoard.forEach(cod => {
        // Busca dados brutos para pegar os créditos
        const mat = window.dadosMaterias.find(m => m.codigo === cod);
        if (mat) creditosTotaisNoBoard += (mat.creditos || 0);
    });

    // --- Passo 0.2: Preparar o Universo ---
    const mapaUniverso = new Map();
    
    const processar = (lista, tipo) => {
        lista.forEach(m => {
            const clone = JSON.parse(JSON.stringify(m));
            clone.tipoReal = tipo; 
            mapaUniverso.set(clone.codigo, clone);
        });
    };
    processar(window.estadoBackend.obrigatorias, 'obrigatoria');
    processar(window.estadoBackend.optativas_escolhidas, 'optativa');

    let listaA = []; // Disponíveis
    let listaB = []; // Travadas por Grupo
    let listaC = []; // Travadas por Matéria (ou CRÉDITOS)

    // --- Passo 1: Distribuição Inicial ---
    mapaUniverso.forEach(materia => {
        const temPre = materia.prereqs?.length && materia.prereqs[0].length;
        const temCo  = materia.correq?.length && materia.correq[0].length;
        const minCred = materia["min-cred"] || 0;

        // [NOVA REGRA] A Blitz dos Créditos Mínimos vem primeiro!
        // Se não tem crédito suficiente, vai pra C e acabou (fica travada/rasurada).
        if (minCred > creditosTotaisNoBoard) {
            listaC.push(materia);
        }
        else if (!temPre && !temCo) {
            listaA.push(materia);
        }
        else if (!temPre && temCo) {
            listaC.push(materia);
        }
        else {
            if (dependeDeGrupoOptativo(materia)) listaB.push(materia);
            else listaC.push(materia);
        }
    });

    // --- Passo 2: O Loop de Resolução ---
    let houveMudanca = true;

    // Sets de Validação (como definimos antes)
    let setConcluidos = new Set([...codigosNoBoard]);
    
    let setUniversoConhecido = new Set([...codigosNoBoard]);
    mapaUniverso.forEach(m => setUniversoConhecido.add(m.codigo)); 
    listaA.forEach(m => setUniversoConhecido.add(m.codigo)); 

    while (houveMudanca) {
        houveMudanca = false;

        // Lista B -> Tenta substituir nome e move para C
        for (let i = listaB.length - 1; i >= 0; i--) {
            const mat = listaB[i];
            if (tentaSubstituirGrupoPorMateria(mat, setUniversoConhecido)) {
                listaB.splice(i, 1); 
                listaC.push(mat);
                houveMudanca = true; 
            }
        }

        // Lista C -> Valida TUDO (Créditos + Pré-Req + Co-Req) e move para A
        for (let i = listaC.length - 1; i >= 0; i--) {
            const mat = listaC[i];
            
            tentaSubstituirGrupoPorMateria(mat, setUniversoConhecido);

            // 1. Validação de Créditos (Novamente, para garantir no loop)
            const minCred = mat["min-cred"] || 0;
            const creditosOk = (creditosTotaisNoBoard >= minCred);

            // 2. Pré-requisitos (Rigoroso: só board libera)
            const preOk = prerequisitosForamAtendidos(mat, setConcluidos);

            // 3. Correquisitos (Flexível: universo libera)
            const coOk = correquisitosForamAtendidos(mat, setUniversoConhecido);

            // Só libera se passar nas 3 barreiras
            if (creditosOk && preOk && coOk) { 
                listaC.splice(i, 1);
                listaA.push(mat);
                // (Nota: Matérias liberadas por loop não entram no setConcluidos para evitar cascata prematura,
                // mantendo a lógica de "só o board destrava pré-requisitos reais")
                houveMudanca = true;
            }
        }
    }

    // --- Passo 3: Preparação Final ---
    const marcarTravado = (lista) => lista.forEach(m => m.estaTravada = true);
    marcarTravado(listaB);
    marcarTravado(listaC);

    let listaFinal = [...listaA, ...listaB, ...listaC];

    listaFinal.sort((a, b) => {
        if (!!a.estaTravada !== !!b.estaTravada) return a.estaTravada ? 1 : -1;
        if (a.tipoReal !== b.tipoReal) return a.tipoReal === 'obrigatoria' ? -1 : 1; 
        return a.codigo.localeCompare(b.codigo);
    });

    window.materiasProcessadas = listaFinal; 
    
    renderizarPoolListaA(listaFinal);
    atualizarContadorCreditos(); 
    atualizarContadorGlobal();   
}
// --- Funções Auxiliares da Lógica ---

function tentaSubstituirGrupoPorMateria(materia, setDesbloqueados) {
    let houveSubstituicao = false;

    // Varre Pré-requisitos
    if (materia.prereqs) {
        materia.prereqs.forEach(grupo => {
            for (let i = 0; i < grupo.length; i++) {
                const cod = grupo[i];
                // Se for código de grupo (tem '0' na pos 3)
                if (cod.length >= 4 && cod[3] === '0' && window.dadosOptativas[cod]) {
                    const opcoes = window.dadosOptativas[cod].Opções;
                    // Procura qual opção está desbloqueada
                    const opcaoEscolhida = opcoes.find(op => setDesbloqueados.has(op));
                    
                    if (opcaoEscolhida) {
                        // console.log(`♻️ SUBSTITUIÇÃO: Em ${materia.codigo}, trocando grupo ${cod} por ${opcaoEscolhida}`);
                        grupo[i] = opcaoEscolhida; 
                        houveSubstituicao = true;
                    }
                }
            }
        });
    }

    // Varre Correquisitos (Mesma lógica)
    if (materia.correq) {
        materia.correq.forEach(grupo => {
            for (let i = 0; i < grupo.length; i++) {
                const cod = grupo[i];
                if (cod.length >= 4 && cod[3] === '0' && window.dadosOptativas[cod]) {
                    const opcoes = window.dadosOptativas[cod].Opções;
                    const opcaoEscolhida = opcoes.find(op => setDesbloqueados.has(op));
                    if (opcaoEscolhida) {
                        grupo[i] = opcaoEscolhida;
                        houveSubstituicao = true;
                    }
                }
            }
        });
    }

    // Se houve substituição, significa que o grupo foi atendido.
    // Mas precisamos garantir que TODOS os grupos da matéria foram atendidos?
    // A lógica original "dependeDeGrupoOptativo" checava se AINDA existia grupo.
    // Vamos checar se sobrou algum grupo pendente.
    return !dependeDeGrupoOptativo(materia);
}

function dependeDeGrupoOptativo(materia) {
    if (!materia.prereqs) return false;
    // Varre todos os grupos de pré-requisitos
    for (let grupo of materia.prereqs) {
        for (let cod of grupo) {
            // Regra: Código tem pelo menos 4 letras e o 4º caractere é '0' (Ex: CRE0712)
            if (cod.length >= 4 && cod[3] === '0') return true; 
        }
    }
    return false;
}

function gruposForamAtendidos(materia, setDisponiveis) {
    // Verifica apenas se os grupos de optativas exigidos foram cumpridos
    if (!materia.prereqs) return true;

    for (let grupo of materia.prereqs) {
        for (let cod of grupo) {
            if (cod.length >= 4 && cod[3] === '0') {
                // É um grupo. Verifica se ALGUMA opção desse grupo está disponível/cursada
                const opcoes = window.dadosOptativas[cod] ? window.dadosOptativas[cod].Opções : [];
                const atendido = opcoes.some(opcaoCod => setDisponiveis.has(opcaoCod));
                
                if (!atendido) return false; // Grupo ainda não satisfeito
            }
        }
    }
    return true;
}

function prerequisitosForamAtendidos(materia, setDisponiveis) {
    const lista = materia.prereqs || [];
    if (!lista.length || !lista[0].length) return true;

    for (let grupo of lista) {
        // Lógica OU entre grupos principais
        let grupoOk = true;
        
        // Lógica E dentro do grupo (sublista)
        for (let cod of grupo) {
            // Se for grupo optativo (ex INF0307), verifica se tem filho (redundância de segurança)
            if (cod.length >= 4 && cod[3] === '0') {
                const opcoes = window.dadosOptativas[cod] ? window.dadosOptativas[cod].Opções : [];
                if (!opcoes.some(c => setDisponiveis.has(c))) {
                    grupoOk = false; break;
                }
            } else {
                // Matéria normal: Tem que estar no set de disponíveis
                if (!setDisponiveis.has(cod)) {
                    grupoOk = false; break;
                }
            }
        }
        
        if (grupoOk) return true; // Achou um caminho válido
    }
    return false; // Nenhum grupo foi totalmente satisfeito
}

function correquisitosForamAtendidos(materia, setDisponiveis) {
    const lista = materia.correq || [];
    if (!lista.length || !lista[0].length) return true;

    for (let grupo of lista) {
        for (let cod of grupo) {
            // Correquisito precisa estar disponível (Lista A) ou cursado (Board)
            if (cod.length >= 4 && cod[3] === '0') {
                const opcoes = window.dadosOptativas[cod] ? window.dadosOptativas[cod].Opções : [];
                if (!opcoes.some(c => setDisponiveis.has(c))) return false;
            } else {
                if (!setDisponiveis.has(cod)) return false;
            }
        }
    }
    return true;
}

// =========================================================
//  Parte 3: Renderização Visual e Interatividade (Drag & Drop)
// =========================================================

// --- 3.1 Renderização da Lista Lateral (Pool) ---

// Desenha o Pool: 1º Matérias da Lista A, 2º Grupos Pendentes
function renderizarPoolListaA(listaMista) {
    const containerPool = document.getElementById("pool-list-container");
    if (!containerPool) return;

    const scrollAnterior = containerPool.scrollTop;
    containerPool.innerHTML = '';

    listaMista.forEach(materia => {
        // Se já está no board, não desenha
        if (document.getElementById('card-' + materia.codigo)) return;

        const item = document.createElement('div');
        item.className = 'pool-item';
        
        // --- 1. Lógica de Estilo e Bloqueio ---
        let tooltipTexto = "";
        
        if (materia.estaTravada) {
            item.classList.add('pool-item-locked');
            item.draggable = false; // IMPEDE O ARRASTO (Resolve o bug de tentar puxar)
            
            // Calcula o motivo do bloqueio para o Tooltip
            const preReqsFaltantes = formatarRequisitos(materia.prereqs); // ou lógica mais complexa se quiser filtrar só o que falta
            tooltipTexto = `BLOQUEADA 🔒\nPré-requisitos pendentes: ${preReqsFaltantes}`;
            item.title = tooltipTexto; // Tooltip nativo do navegador
        } else {
            // Define cor (Azul/Laranja)
            const classeTipo = (materia.tipoReal === 'optativa') ? 'pool-item-optativa' : 'pool-item-obrigatoria';
            item.classList.add(classeTipo);
            item.draggable = true; // Permite arrastar
            item.title = materia.nome; // Tooltip simples
        }

        // IDs e Datasets
        item.id = 'pool-item-' + materia.codigo;
        item.dataset.codigo = normalizarTexto(materia.codigo);
        item.dataset.nome = normalizarTexto(materia.nome);
        item.dataset.codigoOriginal = materia.codigo;

        // --- 2. HTML Interno (Com Info para todos + Cadeado para travados) ---
        // Se estiver travada, mostra cadeado. Se não, vazio.
        const iconeCadeado = materia.estaTravada 
            ? '<i class="fas fa-lock pool-item-lock-icon"></i>' 
            : '';

        item.innerHTML = `
            <div class="pool-item-main-content">
                <span class="pool-item-code">${materia.codigo}</span>
                <span class="pool-item-title">${materia.nome}</span>
            </div>
            
            <div class="pool-item-actions">
                ${iconeCadeado}
                <i class="fas fa-info-circle pool-item-info-btn" title="Ver detalhes"></i>
            </div>
            
            <div class="pool-item-details"></div>
        `;

        // --- 3. Evento do Botão Info (Funciona para todos) ---
        const infoBtn = item.querySelector('.pool-item-info-btn');
        infoBtn.onclick = (e) => {
            e.stopPropagation(); // Não dispara drag nem clique do item
            alternarDetalhesInfo(item, materia);
        };

        containerPool.appendChild(item);
    });

    // Renderiza Grupos Pendentes (Mantido igual)
    if (window.estadoBackend && window.estadoBackend.grupos_pendentes) {
        window.estadoBackend.grupos_pendentes.forEach(grupo => {
            const item = document.createElement('div');
            item.className = 'pool-item-grupo';
            item.id = 'grupo-' + grupo.codigo_grupo.replace(/[^a-zA-Z0-9]/g, '');
            item.dataset.codigo = normalizarTexto(grupo.codigo_grupo);
            item.dataset.nome = normalizarTexto(grupo.fonte || "Optativa"); 

            item.innerHTML = `
                <span class="pool-item-title">${grupo.codigo_grupo}</span>
                <span class="pool-item-chip">${grupo.faltando} Créd.</span>
            `;
            item.onclick = (e) => {
                e.stopPropagation(); 
                abrirModalSelecao(grupo.codigo_grupo, grupo.faltando);
            };
            containerPool.appendChild(item);
        });
    }

    containerPool.scrollTop = scrollAnterior;
    filtrarPool(); 
}

// Mostra/Esconde os detalhes (Pré-requisitos) no Pool
function alternarDetalhesInfo(item, materia) {
    const detalhes = item.querySelector('.pool-item-details');
    if (item.classList.contains('expanded')) {
        item.classList.remove('expanded');
        detalhes.innerHTML = '';
    } else {
        item.classList.add('expanded');
        const pre = formatarRequisitos(materia.prereqs);
        const cor = formatarRequisitos(materia.correq);
        detalhes.innerHTML = `
            <span class="pool-item-chip creditos">${materia.creditos} Créd.</span>
            <div class="pool-item-prereqs"><strong>Pré:</strong> ${pre}</div>
            <div class="pool-item-prereqs"><strong>Co:</strong> ${cor}</div>
        `;
    }
}

// Helper para formatar o texto dos requisitos (ex: "MAT1111 E MAT1112")
function formatarRequisitos(reqs) {
    if (!reqs || !reqs.length || !reqs[0].length) return 'Nenhum';
    return reqs.map(grupo => grupo.join(' E ')).join(' OU ');
}

// --- 3.2 Lógica de Arrastar e Soltar (Drag & Drop) ---

// Configura os eventos de arrastar para uma área (Coluna ou Pool)
function adicionarEventosDeArrasto(alvo) {
    alvo.addEventListener('dragover', e => {
        e.preventDefault();
        const dragged = document.querySelector('.dragging');
        if(!dragged) return;
        
        alvo.classList.add('drag-over');
        
        if (alvo.classList.contains('column-content')) {
            const cod = dragged.dataset.codigoOriginal;
            const materia = encontrarMateria(cod); 
            const idCol = alvo.dataset.columnId;
            const valid = validarRegrasDeNegocio(materia, idCol);
            
            // Vermelho se erro (exceto correq que puxa junto)
            if (!valid.ok && valid.motivo !== 'correq') {
                alvo.classList.add('drag-invalid');
                alvo.classList.remove('drag-over');
            } else {
                alvo.classList.remove('drag-invalid');
            }
        }
    });

    alvo.addEventListener('dragleave', () => {
        alvo.classList.remove('drag-over');
        alvo.classList.remove('drag-invalid');
    });

    alvo.addEventListener('drop', e => {
        e.preventDefault();
        alvo.classList.remove('drag-over');
        alvo.classList.remove('drag-invalid');

        const cod = e.dataTransfer.getData('materia-codigo-original');
        const tipoOrigem = e.dataTransfer.getData('source-type'); 
        const draggedItem = document.querySelector('.dragging');
        
        if (!cod || !draggedItem) return;

        // --- Drop no Board ---
        if (alvo.classList.contains('column-content')) {
            const materia = encontrarMateria(cod); // Usa o clone
            const idCol = alvo.dataset.columnId;
            const isNovo = (draggedItem.closest('.column-content')?.dataset.columnId !== idCol);

            // 1. Trava de Grupo (Segurança Final para Optativas não escolhidas)
            if (materia.correq) {
               const disponiveis = new Set([...obterMateriasCursadasAte(idCol), ...obterMateriasNaColuna(idCol)]);
               for(let g of materia.correq) {
                   for(let c of g) {
                       // Se ainda pede um grupo genérico, bloqueia
                       if(window.dadosOptativas[c] && !requisitoEstaSatisfeito(c, disponiveis)) {
                           alert(`✋ Bloqueado! Exige grupo ${c}. Escolha a optativa primeiro.`);
                           return;
                       }
                   }
               }
            }

            // 2. Preparar Auto-Pull (Identifica quem vem junto)
            let extras = [];
            if (materia.correq) {
                const cursadas = obterMateriasCursadasAte(idCol);
                const naColuna = obterMateriasNaColuna(idCol);
                
                materia.correq.forEach(grupo => {
                    grupo.forEach(codReq => {
                        // Se não cursou e não tá na coluna
                        if (!cursadas.has(codReq) && !naColuna.has(codReq)) {
                            const matReq = encontrarMateria(codReq);
                            if (matReq) {
                                const cardExistente = document.getElementById("card-" + codReq);
                                extras.push({ materia: matReq, card: cardExistente });
                            }
                        }
                    });
                });
            }

            // 2.5 [NOVO] Validação dos Extras (A Blitz nos Amigos)
            // Aqui verificamos se o INF1037 pode entrar (tem CTC4002?)
            for (const itemExtra of extras) {
                // Validamos como se ele fosse entrar nesta coluna
                const validacaoExtra = validarRegrasDeNegocio(itemExtra.materia, idCol);
                
                // Se o amigo tiver problema (ex: falta pré-requisito), aborta tudo!
                if (!validacaoExtra.ok) {
                    alert(`Não é possível adicionar ${materia.codigo}.\nO correquisito automático ${itemExtra.materia.codigo} possui pendências:\n\n${validacaoExtra.msg}`);
                    alvo.closest('.board-column').classList.add('drag-invalid-shake');
                    setTimeout(() => alvo.closest('.board-column').classList.remove('drag-invalid-shake'), 500);
                    return; // Cancela o drop
                }
            }

            // 3. Validação de Créditos
            const atuais = obterCreditosDaColuna(alvo);
            let somar = isNovo ? materia.creditos : 0;
            extras.forEach(x => somar += x.materia.creditos);
            
            if (atuais + somar > MAX_CRED_PERIODO) {
                alert(`Limite de ${MAX_CRED_PERIODO} créditos excedido.`);
                return;
            }

            // 4. Validação de Regras (Principal)
            const valid = validarRegrasDeNegocio(materia, idCol);
            if (!valid.ok && valid.motivo !== 'correq') {
                alert(valid.msg);
                return;
            }

            // --- EFETIVA O DROP ---

            // A) Adiciona a Matéria Principal
            if (tipoOrigem === 'pool') {
                const tipo = draggedItem.classList.contains('pool-item-optativa') ? 'optativa' : 'obrigatoria';
                alvo.appendChild(criarCardMateria(materia, tipo));
            } else {
                alvo.appendChild(draggedItem);
            }

            // B) Adiciona os Correquisitos (Auto-Pull)
            extras.forEach(x => {
                if (x.card) alvo.appendChild(x.card);
                else alvo.appendChild(criarCardMateria(x.materia, 'obrigatoria'));
            });

            atualizarTudo();
        } 
        
        // --- Drop no Pool ---
        else if (alvo.classList.contains('pool-list')) {
            if (tipoOrigem === 'card') {
                draggedItem.remove();
                atualizarTudo();
            }
        }

        // --- Drop na Grade Horária (Células da Tabela) ---
        else if (alvo.classList.contains('grid-dropzone')) {
            // Apenas move o elemento visualmente
            if (draggedItem) {
                // Se o bloco veio do Pool, ele é um "filho" novo. Se veio de outra célula, é apenas movido.
                alvo.appendChild(draggedItem);
                
                // Ajuste visual para o bloco caber bonito na célula
                draggedItem.style.width = "100%";
                draggedItem.style.margin = "0";
            }
        }
    });
}

// Configura o início do arrasto (DragStart) globalmente
function inicializarArrastarSoltar() {
    document.addEventListener('dragstart', evento => {
        const alvo = evento.target.closest('.pool-item, .materia-card');
        
        // Não permite arrastar grupos (amarelos)
        if (!alvo || alvo.classList.contains('pool-item-grupo')) {
            if(alvo) evento.preventDefault();
            return;
        }
        
        // CORREÇÃO AQUI: 
        // 1. Tenta pegar codigoOriginal (do Pool)
        // 2. Tenta pegar codigo (do Card do Board)
        // 3. Se falhar, tenta pegar do ID na posição certa [1]
        const codigo = alvo.dataset.codigoOriginal || alvo.dataset.codigo || alvo.id.split('-')[1];
        
        if (codigo) {
            evento.dataTransfer.setData('materia-codigo-original', codigo);
            // Identifica de onde veio (card ou pool)
            const tipo = alvo.classList.contains('materia-card') ? 'card' : 'pool';
            evento.dataTransfer.setData('source-type', tipo);
            
            // Para garantir consistência
            alvo.dataset.codigoOriginal = codigo;
            
            setTimeout(() => alvo.classList.add('dragging'), 0);
        } else {
            console.error("Não foi possível identificar o código da matéria ao arrastar.", alvo);
            evento.preventDefault();
        }
    });

    document.addEventListener('dragend', () => {
        const itemArrastado = document.querySelector('.dragging');
        if (itemArrastado) itemArrastado.classList.remove('dragging');
        
        // Limpa classes visuais de todas as áreas
        document.querySelectorAll('.drag-over, .drag-invalid').forEach(el => {
            el.classList.remove('drag-over');
            el.classList.remove('drag-invalid');
        });
    });
}

// Cria o HTML do Card que fica no Board (Colorido)
function criarCardMateria(materia, tipo = 'obrigatoria') {
    if (!materia) return null;

    const card = document.createElement('div');
    card.className = 'materia-card';
    
    // Dados essenciais para o sistema
    card.dataset.codigo = materia.codigo;
    card.dataset.codigoOriginal = materia.codigo; // Adicionado para facilitar o dragstart
    card.id = 'card-' + materia.codigo;
    
    card.draggable = true;

    // Define cores (Azul = Obrigatória, Laranja = Optativa)
    let corBarra = '#3498db'; 
    let textoTag = 'Obrigatória';
    if (tipo === 'optativa') {
        corBarra = '#f39c12';
        textoTag = 'Optativa';
    }

    const preReqTexto = formatarRequisitos(materia.prereqs);
    const coReqTexto = formatarRequisitos(materia.correq);

    card.innerHTML = `
        <div class="card-header-bar" style="background-color: ${corBarra};"></div> 
        <div class="card-content">
            <div>
                <span class="card-code">${materia.codigo}</span>
                <span class="card-chip creditos">${materia.creditos} Créditos</span>
            </div>
            <h4 class="card-title">${materia.nome}</h4>
            <div class="card-prereqs">
                <strong>Pré-req:</strong> <span>${preReqTexto}</span>
            </div>
             <div class="card-prereqs" style="margin-top:4px;">
                <strong>Correq:</strong> <span>${coReqTexto}</span>
            </div>
        </div>
        <div class="card-footer">
            <span class="category-tag ${tipo}">${textoTag}</span>
        </div>
    `;
    return card;
}

// =========================================================
//  Parte 4: Utilitários, Helpers e Controles de Interface
// =========================================================

// --- 4.1 Helpers de Leitura do DOM (Lendo a tela) ---

// Pega os valores (data-value) dos chips selecionados em uma área
function pegarValoresSelecionados(seletorCSS) {
    const elementos = document.querySelectorAll(`${seletorCSS} .chip-selected`);
    return Array.from(elementos).map(chip => chip.dataset.value);
}

// Retorna uma lista com os códigos de TODAS as matérias que estão no Board
function pegarMateriasNoBoard() {
    const cards = document.querySelectorAll('#board-container .materia-card');
    return Array.from(cards).map(card => card.dataset.codigo); 
}

// Calcula quantos créditos existem em uma coluna específica
function obterCreditosDaColuna(colunaElemento) {
    let total = 0;
    colunaElemento.querySelectorAll('.materia-card').forEach(card => {
        // 1. Tenta buscar os dados oficiais no cache (Mais preciso)
        const materia = encontrarMateria(card.dataset.codigo);
        
        if (materia && typeof materia.creditos === 'number') {
            total += materia.creditos;
        } else {
            // 2. PLANO B (Fallback do código antigo): Lê o texto do card
            const chip = card.querySelector('.card-chip.creditos');
            if (chip) {
                // Remove tudo que não for número (ex: "4 Créditos" -> "4")
                const valorTexto = parseInt(chip.textContent.replace(/\D/g, '')) || 0;
                total += valorTexto;
            }
        }
    });
    return total;
}

// --- 4.2 Validação Temporal (Tempo e Ordem) ---

// Soma créditos de todos os períodos ANTERIORES ao alvo
function obterCreditosAcumuladosAte(numeroPeriodoAlvo) {
    let total = 0;
    for (let i = 1; i < numeroPeriodoAlvo; i++) {
        const coluna = document.getElementById(`column-p${i}`);
        if (coluna) {
            const conteudoColuna = coluna.querySelector('.column-content');
            total += obterCreditosDaColuna(conteudoColuna);
        }
    }
    return total;
}

// Retorna um Conjunto (Set) com códigos de matérias dos períodos ANTERIORES
function obterMateriasCursadasAte(idColunaAlvo) {
    const cursadas = new Set();
    const numeroAlvo = parseInt(idColunaAlvo.replace('p', ''), 10);

    for (let i = 1; i < numeroAlvo; i++) {
        const coluna = document.getElementById(`column-p${i}`);
        if (coluna) {
            coluna.querySelectorAll('.materia-card').forEach(card => {
                cursadas.add(card.dataset.codigo);
            });
        }
    }
    return cursadas;
}

// Retorna um Conjunto (Set) com códigos das matérias que estão na coluna atual
function obterMateriasNaColuna(idColunaAlvo) {
    const naColuna = new Set();
    const coluna = document.querySelector(`.column-content[data-column-id="${idColunaAlvo}"]`);
    if (coluna) {
        coluna.querySelectorAll('.materia-card').forEach(card => {
            naColuna.add(card.dataset.codigo);
        });
    }
    return naColuna;
}

// Valida regras que dependem do TEMPO (Pré-requisitos e Mínimo de Créditos)
function validarRegrasDeNegocio(materia, idColunaAlvo) {
    if (!materia) return { ok: true };
    const numeroPeriodo = parseInt(idColunaAlvo.replace('p', ''), 10);
    const cursadasAnteriores = obterMateriasCursadasAte(idColunaAlvo);
    const creditosAcumulados = obterCreditosAcumuladosAte(numeroPeriodo);
    
    // Para validar correquisitos, precisamos saber quem vai estar junto no mesmo período
    const naMesmaColuna = obterMateriasNaColuna(idColunaAlvo);

    // 1. Regra: Mínimo de Créditos
    const minCred = materia["min-cred"] || 0;
    if (minCred > 0 && creditosAcumulados < minCred) {
        return { 
            ok: false, 
            motivo: 'creditos',
            msg: `Bloqueado: Esta matéria exige ${minCred} créditos acumulados (você tem ${creditosAcumulados}).` 
        };
    }

    // 2. Regra: Pré-requisitos (Passado)
    if (!prerequisitosForamAtendidos(materia, cursadasAnteriores)) {
        const faltantes = formatarRequisitos(materia.prereqs);
        return { 
            ok: false, 
            motivo: 'prereq',
            msg: `Bloqueado: Pré-requisitos não cumpridos.\nFaltam: ${faltantes}` 
        };
    }

    // 3. Regra: Correquisitos (Passado OU Presente)
    // Verifica se os correquisitos estão nas cursadas OU na coluna atual
    const universoCorreq = new Set([...cursadasAnteriores, ...naMesmaColuna]);
    
    // Atenção: A função correquisitosForamAtendidos checa se está no Set.
    // Mas se estivermos fazendo um Auto-Pull, a matéria ainda não está no DOM.
    // O Drop vai ignorar este erro específico se for o caso, mas a validação aqui tem que ser rígida.
    if (!correquisitosForamAtendidos(materia, universoCorreq)) {
         const faltantes = formatarRequisitos(materia.correq);
         return {
             ok: false,
             motivo: 'correq',
             msg: `Bloqueado: Correquisito obrigatório ausente.\nDeve cursar junto ou antes: ${faltantes}`
         };
    }

    return { ok: true };
}

// Verifica todo o board em cascata (se eu mover Cálculo 1, Cálculo 2 cai?)
function validarBoardEmCascata() {
    let houveMudanca = true;
    const colunas = document.querySelectorAll('.board-column');

    while (houveMudanca) {
        houveMudanca = false;
        
        // Varre período a período
        for (let i = 0; i < colunas.length; i++) {
            const coluna = colunas[i];
            const idColuna = coluna.querySelector('.column-content').dataset.columnId;
            const cards = coluna.querySelectorAll('.materia-card');

            cards.forEach(card => {
                const materia = encontrarMateria(card.dataset.codigo);
                const validacao = validarRegrasDeNegocio(materia, idColuna);

                if (!validacao.ok) {
                    // Opa, regra quebrada! Remove do board e devolve pro limbo
                    card.remove();
                    houveMudanca = true; 
                    // (A matéria voltará para a Lista A automaticamente quando processarEstadoDoBackend rodar)
                }
            });
        }
    }
}

// --- 4.3 Atualização de Interface (Contadores e Textos) ---

function atualizarContadorCreditos() {
    document.querySelectorAll('.board-column').forEach(coluna => {
        const conteudo = coluna.querySelector('.column-content');
        const total = obterCreditosDaColuna(conteudo);
        const contadorSpan = coluna.querySelector('.column-credit-counter');
        
        if (contadorSpan) {
            contadorSpan.textContent = total + ' Créditos';
            // Pinta de vermelho se passar do limite
            if (total > MAX_CRED_PERIODO) {
                contadorSpan.classList.add('error'); // (Definir .error no CSS: color: red)
            } else {
                contadorSpan.classList.remove('error');
            }
        }
    });
}

function atualizarContadorGlobal() {
    const elemento = document.getElementById('global-credit-counter');
    // Se não tiver elemento ou dados do backend, mostra 0/0 mas não quebra
    if (!elemento) return;
    
    // 1. Planejado: Soma tudo que está visualmente no board
    let totalPlanejado = 0;
    document.querySelectorAll('.board-column .column-content').forEach(coluna => {
        totalPlanejado += obterCreditosDaColuna(coluna);
    });

    // 2. Exigido: Soma tudo que o Python mandou (com proteção contra null/undefined)
    let totalExigido = 0;
    if (window.estadoBackend) {
        const backend = window.estadoBackend;
        if (backend.obrigatorias) {
            backend.obrigatorias.forEach(m => totalExigido += (m.creditos || 0));
        }
        if (backend.optativas_escolhidas) {
            backend.optativas_escolhidas.forEach(m => totalExigido += (m.creditos || 0));
        }
        if (backend.grupos_pendentes) {
            backend.grupos_pendentes.forEach(g => totalExigido += (g.faltando || 0));
        }
    }

    // 3. Atualiza a UI
    elemento.innerText = `${totalPlanejado} / ${totalExigido}`;
    
    // Feedback visual de conclusão
    if (totalExigido > 0 && totalPlanejado >= totalExigido) {
        elemento.classList.add('completed');
        elemento.style.backgroundColor = '#27ae60'; // Força a cor verde
        elemento.style.color = 'white';
    } else {
        elemento.classList.remove('completed');
        elemento.style.backgroundColor = '#e0e0e0'; // Volta pro cinza
        elemento.style.color = '#333';
    }
}

// --- 4.4 Funcionalidades Visuais (Sidebar, Modal, Chips) ---

function popularDropdown(seletor, opcoes) {
    const container = document.querySelector(seletor);
    if (!container) return;
    container.innerHTML = '';
    
    opcoes.forEach(textoOpcao => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.dataset.value = textoOpcao;
        // Encurta nomes longos (Ex: Engenharia de Computação -> Eng. Computação)
        chip.textContent = textoOpcao.startsWith("Engenharia de ") ? "Eng. " + textoOpcao.substring(14) : textoOpcao;
        container.appendChild(chip);
    });
}

function normalizarTexto(texto) {
    return texto ? texto.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
}

function inicializarBuscaPool() {
    const inputBusca = document.getElementById('pool-search-input');
    if (inputBusca) {
        inputBusca.addEventListener('input', filtrarPool);
    }
}

function filtrarPool() {
    const termo = normalizarTexto(document.getElementById('pool-search-input').value);
    document.querySelectorAll('#pool-list-container .pool-item').forEach(item => {
        const match = item.dataset.codigo.includes(termo) || item.dataset.nome.includes(termo);
        // Se for grupo, sempre mostra (ou filtra também pelo nome do grupo)
        if (item.classList.contains('pool-item-grupo')) {
             item.style.display = 'flex'; 
        } else {
             item.style.display = match ? 'flex' : 'none';
        }
    });
}

// --- Sidebar e Chips ---

function inicializarSidebar() {
    const botao = document.getElementById("toggle-sidebar-btn");
    const sidebar = document.querySelector(".sidebar");
    const main = document.querySelector(".planner-board"); // Ajuste conforme seu HTML
    
    if (botao && sidebar) {
        botao.addEventListener("click", () => {
            sidebar.classList.toggle("recolhido");
            if(main) main.classList.toggle("recolhido");
        });
    }
}

function inicializarTogglePool() {
    const botao = document.getElementById("toggle-pool-btn");
    const poolSidebar = document.querySelector(".materia-pool");
    const main = document.querySelector(".planner-board");
    
    if (botao && poolSidebar) {
        botao.addEventListener("click", () => {
            poolSidebar.classList.toggle("pool-recolhido");
            if(main) main.classList.toggle("pool-recolhido");
        });
    }
}

function inicializarSeletoresDeChips() {
    // Configura os 3 menus: Formação, Ênfase, Domínios
    configurarMenuChip("#formacoes-selection", "#formacoes-options", true); // Multi
    configurarMenuChip("#dominios-selection", "#dominios-options", true);   // Multi
    configurarMenuChip("#enfase-selection", "#enfase-options", false);      // Single (uma ênfase por vez)
}

function configurarMenuChip(seletorArea, seletorDropdown, permiteMultiplos) {
    const area = document.querySelector(seletorArea);
    const dropdown = document.querySelector(seletorDropdown);
    
    if (!area || !dropdown) return;

    // Abrir/Fechar dropdown
    area.addEventListener("click", (e) => {
        e.stopPropagation();
        // Se clicou no X de um chip, remove
        if (e.target.classList.contains('fa-times')) {
            const chip = e.target.parentElement;
            const valor = chip.dataset.value;
            chip.remove();
            
            // Reabilita a opção no dropdown
            const opcao = dropdown.querySelector(`.chip[data-value="${valor}"]`);
            if (opcao) opcao.classList.remove('disabled');
            
            // Se for formação, atualiza ênfases disponíveis
            if (seletorArea === "#formacoes-selection") atualizarEnfasesDisponiveis();
            
            processarEstadoDoBackend(); // Recalcula tudo
            return;
        }
        
        // Alterna visibilidade
        const estavaAberto = dropdown.classList.contains("dropdown-open");
        fecharTodosDropdowns();
        if (!estavaAberto) {
            dropdown.classList.add("dropdown-open");
            area.classList.add("edit-mode");
        }
    });

    // Selecionar item do dropdown
    dropdown.addEventListener("click", (e) => {
        e.stopPropagation();
        const opcao = e.target.closest('.chip');
        if (opcao && !opcao.classList.contains('disabled')) {
            const valor = opcao.dataset.value;
            const texto = opcao.textContent;

            // Se for seleção única, remove o anterior
            if (!permiteMultiplos) {
                const anterior = area.querySelector('.chip-selected');
                if (anterior) {
                    const valorAnt = anterior.dataset.value;
                    const opAnt = dropdown.querySelector(`.chip[data-value="${valorAnt}"]`);
                    if(opAnt) opAnt.classList.remove('disabled');
                    anterior.remove();
                }
            }

            // Cria o chip visual selecionado
            const novoChip = document.createElement('span');
            novoChip.className = 'chip-selected';
            novoChip.dataset.value = valor;
            novoChip.innerHTML = `${texto} <i class="fas fa-times"></i>`;
            area.appendChild(novoChip);

            // Desabilita no dropdown
            opcao.classList.add('disabled');
            
            if (seletorArea === "#formacoes-selection") atualizarEnfasesDisponiveis();
            
            fecharTodosDropdowns();
            processarEstadoDoBackend(); // Recalcula tudo
        }
    });
}

function fecharTodosDropdowns() {
    document.querySelectorAll('.options-dropdown').forEach(d => d.classList.remove('dropdown-open'));
    document.querySelectorAll('.selection-area').forEach(a => a.classList.remove('edit-mode'));
}

// Lógica Especial: Mostrar menu de Ênfase apenas se a Formação tiver ênfases
function atualizarEnfasesDisponiveis() {
    const formacoes = pegarValoresSelecionados("#formacoes-selection");
    const sectionEnfase = document.getElementById('enfase-section');
    
    // Simplificação: Pega a última formação selecionada para mostrar as ênfases dela
    // (O sistema Python suporta união, mas a UI de ênfase foca em uma por vez para não confundir)
    const ultimaFormacao = formacoes[formacoes.length - 1];
    
    if (ultimaFormacao && window.dadosFormacoes[ultimaFormacao] && window.dadosFormacoes[ultimaFormacao].enfase) {
        const enfases = Object.keys(window.dadosFormacoes[ultimaFormacao].enfase);
        if (enfases.length > 0) {
            popularDropdown('#enfase-options', enfases);
            sectionEnfase.style.display = 'block';
            return;
        }
    }
    // Se não tiver ênfase, esconde
    sectionEnfase.style.display = 'none';
    const area = document.getElementById('enfase-selection');
    if(area) area.innerHTML = ''; // Limpa seleção anterior
}

// Função centralizadora para atualizar a UI após mudanças manuais (Drag & Drop)
function atualizarTudo() {
    atualizarContadorCreditos(); // Atualiza os contadores das colunas (Períodos)
    atualizarContadorGlobal();   // Atualiza o contador do Header (Planejado / Total)
    validarBoardEmCascata();     // Verifica se alguma regra foi quebrada
    salvarBoardLocal();          // Salva os períodos no localhost
    processarEstadoDoBackend();  // Envia o novo estado para o Python e recalcula as filas A/B/C
}

// --- Controles do Board (Colunas) ---

function inicializarControlesDoBoard() {
    document.getElementById('add-period-btn')?.addEventListener('click', adicionarColunaPeriodo);
    // Adiciona evento de delete na coluna 1 (se quiser permitir deletar a 1, caso contrário comece do loop)
    // Geralmente a Coluna 1 é fixa ou configurável.
}

function adicionarColunaPeriodo() {
    const container = document.getElementById('board-container');
    const btnContainer = document.querySelector('.add-column-container');
    
    // Cria ID único (p2, p3, p4...)
    const novoId = `p${contadorPeriodos}`;
    
    const novaColuna = document.createElement('div');
    novaColuna.className = 'board-column';
    novaColuna.id = `column-${novoId}`;
    novaColuna.innerHTML = `
        <div class="column-header">
            <h3 class="column-title">${contadorPeriodos}º Período</h3>
            <div class="header-controls">
                <span class="column-credit-counter">0 Créditos</span>
                <button class="delete-column-btn"><i class="fas fa-times"></i></button>
            </div>
        </div>
        <div class="column-content" data-column-id="${novoId}"></div>
    `;

    // Insere ANTES do botão de adicionar
    container.insertBefore(novaColuna, btnContainer);
    
    // Adiciona lógica de arrastar na nova coluna
    adicionarEventosDeArrasto(novaColuna.querySelector('.column-content'));
    
    // Lógica de Deletar Coluna
    novaColuna.querySelector('.delete-column-btn').addEventListener('click', () => {
        // Devolve matérias para o pool (ou deleta) - Aqui optamos por deletar a coluna e forçar recalculo
        // Matérias que sumirem voltarão para a Lista A automaticamente pois sairão de "pegarMateriasNoBoard"
        novaColuna.remove();
        processarEstadoDoBackend();
        // Nota: Idealmente renumeraríamos os períodos (2, 3, 4...) visualmente.
    });

    contadorPeriodos++;
}

// --- 4.5 Modal de Seleção de Optativa ---

function inicializarControlesModal() {
    const backdrop = document.getElementById('modal-backdrop');
    const fecharBtn = document.getElementById('modal-fechar-btn');
    
    if (backdrop) backdrop.addEventListener('click', fecharModalSelecao);
    if (fecharBtn) fecharBtn.addEventListener('click', fecharModalSelecao);
}

function abrirModalSelecao(codigoGrupo, creditosFaltando) {
    const modal = document.getElementById('modal-selecao');
    const backdrop = document.getElementById('modal-backdrop');
    const lista = document.getElementById('modal-lista-opcoes');
    const titulo = document.getElementById('modal-titulo');
    const descricao = document.getElementById('modal-descricao');

    titulo.textContent = `Escolher: ${codigoGrupo}`;
    descricao.textContent = `Selecione uma matéria para abater ${creditosFaltando} créditos.`;
    lista.innerHTML = '<p style="padding:10px;">Carregando opções...</p>';

    modal.classList.remove('escondido');
    backdrop.classList.remove('escondido');

    // Busca opções válidas no Backend
    // Enviamos o que já cursamos para ele filtrar (embora o novo endpoint mostre tudo, é bom padrão)
    const cursadas = Array.from(pegarMateriasNoBoard());

    fetch('/api/get-opcoes-grupo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo_grupo: codigoGrupo, materias_cursadas_set: cursadas })
    })
    .then(r => r.json())
    .then(opcoes => {
        lista.innerHTML = '';
        if (opcoes.length === 0) {
            lista.innerHTML = '<p style="padding:10px;">Nenhuma opção disponível no momento.</p>';
            return;
        }

        opcoes.forEach(mat => {
            const btn = document.createElement('div');
            btn.className = 'modal-materia-card'; // Use seu CSS novo aqui
            // Renderiza bonito
            const preReq = formatarRequisitos(mat.prereqs);
            btn.innerHTML = `
                <div class="modal-card-main">
                    <span class="modal-card-code">${mat.codigo}</span>
                    <h5 class="modal-card-title">${mat.nome}</h5>
                    <div class="modal-card-prereqs"><strong>Pré:</strong> ${preReq}</div>
                </div>
                <span class="modal-card-chip creditos">${mat.creditos} Créd.</span>
            `;
            
            btn.onclick = () => selecionarMateriaDoModal(mat);
            lista.appendChild(btn);
        });
    })
    .catch(err => {
        console.error(err);
        lista.innerHTML = '<p style="padding:10px; color:red;">Erro ao carregar.</p>';
    });
}

function fecharModalSelecao() {
    document.getElementById('modal-selecao').classList.add('escondido');
    document.getElementById('modal-backdrop').classList.add('escondido');
}

function selecionarMateriaDoModal(materia) {
    // 1. Adiciona a matéria ao cache global (se não tiver)
    adicionarMateriaAoCache(materia);
    
    // 2. Fecha modal
    fecharModalSelecao();
    
    // 3. Roda o processamento passando essa matéria como "Manual"
    // Isso vai forçá-la a entrar na lista de 'pre_selecionadas' enviada ao Python,
    // fazendo com que ela apareça na Lista A (e destrave a Lista B).
    processarEstadoDoBackend(materia.codigo);
}

function requisitoEstaSatisfeito(codigoRequisito, setMaterias) {
    // 1. Checa direto (Matéria normal)
    if (setMaterias.has(codigoRequisito)) return true;

    // 2. Checa se é grupo (Optativa)
    if (window.dadosOptativas && window.dadosOptativas[codigoRequisito]) {
        const opcoes = window.dadosOptativas[codigoRequisito].Opções || [];
        // Se ALGUMA das opções do grupo estiver presente, tá valendo!
        return opcoes.some(opcaoCod => setMaterias.has(opcaoCod));
    }

    return false;
}

// Helper Inteligente: Busca a matéria processada (com requisitos atualizados) se existir
function encontrarMateria(codigo) {
    if (!codigo) return null;
    
    // 1. Prioridade: Lista Processada (Clone com requisitos alterados)
    let mat = window.materiasProcessadas.find(m => m.codigo === codigo);
    if (mat) return mat;

    // 2. Fallback: Lista Original (Dados brutos do JSON)
    // Isso garante que se o item ainda não foi processado (ex: acabou de carregar), ele é achado.
    return window.dadosMaterias.find(m => m.codigo === codigo);
}

// --- Persistência Local (LocalStorage) ---

function salvarBoardLocal() {
    const estadoBoard = {};
    
    // 1. Salva as colunas e seus cards
    document.querySelectorAll('.board-column').forEach(coluna => {
        const idColuna = coluna.querySelector('.column-content').dataset.columnId; // ex: "p1"
        const cards = [];
        coluna.querySelectorAll('.materia-card').forEach(card => {
            cards.push(card.dataset.codigo);
        });
        estadoBoard[idColuna] = cards;
    });

    // 2. Salva as seleções (Cursos, Ênfases)
    const selecoes = {
        formacoes: pegarValoresSelecionados("#formacoes-selection"),
        dominios: pegarValoresSelecionados("#dominios-selection"),
        enfase: document.querySelector("#enfase-selection .chip-selected")?.dataset.value || null
    };

    const pacoteSalvo = {
        board: estadoBoard,
        selecoes: selecoes,
        timestamp: new Date().getTime()
    };

    localStorage.setItem('mentorGradus_Estado', JSON.stringify(pacoteSalvo));
    // console.log("💾 Estado salvo no navegador.");
}

function limparMateriasExcedentes() {
    if (!window.estadoBackend) return;

    // 1. Identificar o que é OBRIGATÓRIO agora (A "Elite")
    const novasObrigatorias = new Set();
    if (window.estadoBackend.obrigatorias) {
        window.estadoBackend.obrigatorias.forEach(m => novasObrigatorias.add(m.codigo));
    }

    // 2. Identificar o que é VÁLIDO no geral (Obrigatorias + Optativas)
    const novasValidasTotal = new Set([...novasObrigatorias]);
    if (window.estadoBackend.optativas_escolhidas) {
        window.estadoBackend.optativas_escolhidas.forEach(m => novasValidasTotal.add(m.codigo));
    }

    const cardsNoBoard = document.querySelectorAll('#board-container .materia-card');
    let removeuAlguem = false;

    cardsNoBoard.forEach(card => {
        const codigo = card.dataset.codigo;
        
        // --- CHECAGEM 1: O Backend disse que não serve mais pra nada? ---
        if (!novasValidasTotal.has(codigo)) {
            card.remove();
            removeuAlguem = true;
            return; // Já removeu, vai pro próximo
        }

        // --- CHECAGEM 2 (A CORREÇÃO): A Regra da "Despromoção" ---
        // Verificamos o estado VISUAL ATUAL do card (antes de ser hidratado/atualizado)
        const tagAnterior = card.querySelector('.category-tag');
        
        // Verifica se ele ESTAVA marcado como Obrigatória
        const eraObrigatoria = tagAnterior && 
                               (tagAnterior.classList.contains('obrigatoria') || 
                                tagAnterior.textContent.toLowerCase().includes('obrigatória'));

        // Se era Obrigatória, mas na lista nova NÃO É MAIS Obrigatória (virou optativa ou sobra)...
        // ...significa que ela perdeu a razão de estar ali (pertencia ao curso removido).
        if (eraObrigatoria && !novasObrigatorias.has(codigo)) {
            card.remove(); // Tchau!
            removeuAlguem = true;
        }
    });

    if (removeuAlguem) {
        console.log("🧹 Board limpo de matérias órfãs ou despromovidas.");
    }
}

function carregarBoardLocal() {
    const salvo = localStorage.getItem('mentorGradus_Estado');
    if (!salvo) return;

    const dados = JSON.parse(salvo);
    
    // 1. Restaura Seleções e Sincroniza Dropdowns
    const restaurarChipsESincronizar = (seletorArea, seletorDropdown, lista) => {
        const area = document.querySelector(seletorArea);
        const dropdown = document.querySelector(seletorDropdown);
        if(!area) return;
        
        area.innerHTML = ''; // Limpa para evitar duplicatas visuais
        
        if (!lista) return;

        lista.forEach(val => {
            // A) Cria o chip visual selecionado
            const span = document.createElement('span');
            span.className = 'chip-selected';
            span.dataset.value = val;
            
            // Tratamento de nome curto (Engenharia -> Eng.)
            const texto = val.startsWith("Engenharia de ") ? "Eng. " + val.substring(14) : val;
            span.innerHTML = `${texto} <i class="fas fa-times"></i>`;
            area.appendChild(span);

            // B) Vai no Dropdown e marca como DISABLED (Risca a opção)
            if (dropdown) {
                // Busca a opção correspondente pelo valor
                const opcao = dropdown.querySelector(`.chip[data-value="${val}"]`);
                if (opcao) {
                    opcao.classList.add('disabled');
                }
            }
        });
    };

    // Restaura Formações e Domínios (e avisa os menus!)
    restaurarChipsESincronizar("#formacoes-selection", "#formacoes-options", dados.selecoes.formacoes);
    restaurarChipsESincronizar("#dominios-selection", "#dominios-options", dados.selecoes.dominios);
    
    // IMPORTANTE: Agora que as formações estão lá, forçamos a atualização da lista de Ênfases
    // Isso popula o dropdown de ênfases com as opções corretas antes de tentarmos selecionar uma.
    atualizarEnfasesDisponiveis();

    // Restaura Ênfase (se houver)
    if (dados.selecoes.enfase) {
        const areaEnfase = document.querySelector("#enfase-selection");
        const dropdownEnfase = document.querySelector("#enfase-options");
        
        if(areaEnfase) {
            const val = dados.selecoes.enfase;
            
            // Cria o chip
            const span = document.createElement('span');
            span.className = 'chip-selected';
            span.dataset.value = val;
            span.innerHTML = `${val} <i class="fas fa-times"></i>`;
            areaEnfase.innerHTML = ''; // Limpa anterior
            areaEnfase.appendChild(span);
            
            // Garante que a seção apareça
            const section = document.getElementById('enfase-section');
            if(section) section.style.display = 'block';

            // Marca como ocupada no dropdown recém-criado
            if (dropdownEnfase) {
                const opcao = dropdownEnfase.querySelector(`.chip[data-value="${val}"]`);
                if (opcao) opcao.classList.add('disabled');
            }
        }
    }

    // 2. Restaura o Board (Colunas e Cards)
    // (O resto continua igual, apenas garantindo que as colunas existam)
    const colunasSalvas = Object.keys(dados.board); // ["p1", "p2", "p3"...]
    
    // Ordena numericamente
    colunasSalvas.sort((a,b) => parseInt(a.replace('p','')) - parseInt(b.replace('p','')));

    colunasSalvas.forEach(idCol => {
        let contentDiv = document.querySelector(`.column-content[data-column-id="${idCol}"]`);
        
        // Se a coluna não existe (ex: p5), cria na hora
        if (!contentDiv) {
            adicionarColunaPeriodo(); 
            contentDiv = document.querySelector(`.column-content[data-column-id="${idCol}"]`);
        }

        // Adiciona os cards "placeholder" (serão hidratados depois)
        const codigos = dados.board[idCol];
        codigos.forEach(cod => {
            const card = document.createElement('div');
            card.className = 'materia-card';
            card.id = 'card-' + cod;
            card.dataset.codigo = cod;
            card.innerHTML = `<span class="card-code">${cod}</span>...carregando...`; 
            contentDiv.appendChild(card);
        });
    });
}

// Atualiza o HTML dos cards no board com os dados reais (Nome, Créditos, etc.)
function hidratarBoard() {
    // 1. Cria mapas rápidos para saber o tipo real de cada matéria AGORA
    const mapObrigatorias = new Set();
    const mapOptativas = new Set();
    
    if (window.estadoBackend) {
        window.estadoBackend.obrigatorias.forEach(m => mapObrigatorias.add(m.codigo));
        window.estadoBackend.optativas_escolhidas.forEach(m => mapOptativas.add(m.codigo));
    }

    document.querySelectorAll('.board-column .materia-card').forEach(card => {
        const codigo = card.dataset.codigo;
        const materia = encontrarMateria(codigo);

        if (materia) {
            // 2. Redefine o tipo com base na verdade do Backend atual
            let tipoReal = 'obrigatoria'; // Default
            if (mapOptativas.has(codigo)) tipoReal = 'optativa';
            else if (mapObrigatorias.has(codigo)) tipoReal = 'obrigatoria';
            
            // Se não estiver em nenhum (ex: matéria órfã que escapou da limpeza), assume o que já estava ou obrigatoria.
            
            const corBarra = (tipoReal === 'optativa') ? '#f39c12' : '#3498db';
            const textoTag = (tipoReal === 'optativa') ? 'Optativa' : 'Obrigatória';
            const preReqTexto = formatarRequisitos(materia.prereqs);
            const coReqTexto = formatarRequisitos(materia.correq);

            // 3. Atualiza o HTML (e garante draggable=true)
            card.draggable = true; // Força ser arrastável
            card.innerHTML = `
                <div class="card-header-bar" style="background-color: ${corBarra};"></div> 
                <div class="card-content">
                    <div>
                        <span class="card-code">${materia.codigo}</span>
                        <span class="card-chip creditos">${materia.creditos} Créditos</span>
                    </div>
                    <h4 class="card-title">${materia.nome}</h4>
                    <div class="card-prereqs">
                        <strong>Pré-req:</strong> <span>${preReqTexto}</span>
                    </div>
                     <div class="card-prereqs" style="margin-top:4px;">
                        <strong>Correq:</strong> <span>${coReqTexto}</span>
                    </div>
                </div>
                <div class="card-footer">
                    <span class="category-tag ${tipoReal}">${textoTag}</span>
                </div>
            `;
        }
    });
}

// Fechando dropdowns ao clicar fora
document.addEventListener("click", fecharTodosDropdowns);

