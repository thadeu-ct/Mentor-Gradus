import json
from collections import defaultdict
import os

def _criar_prerequisitos_funcionais(dados_mat_map, dados_opt):
    """
    Pré-processa o mapa de matérias para expandir pré-requisitos que são grupos.
    Ex: [["CRE0712"]] vira [["CRE1212"], ["CRE1215"], ...]
    """
    print("Iniciando expansão de pré-requisitos de grupos...")
    
    for materia_info in dados_mat_map.values():
        prereqs_originais = materia_info.get("prereqs", [[]])
        if not prereqs_originais or prereqs_originais == [[]]:
            materia_info["prereqs_funcionais"] = prereqs_originais
            continue

        novos_prereqs_finais = [] # A lista final de grupos "OU"
        
        # Loop "OU" (cada grupo na lista original)
        for grupo_prereq in prereqs_originais:
            if not grupo_prereq: # Mantém grupos vazios [[]]
                novos_prereqs_finais.append([])
                continue

            # Checa se o grupo é um "grupo de optativa"
            # (Definido como: ter 1 item E esse item estar no dados_opt)
            primeiro_item_do_grupo = grupo_prereq[0]
            
            if primeiro_item_do_grupo in dados_opt and len(grupo_prereq) == 1:
                # É um grupo de optativa! Ex: ["CRE0712"]
                opcoes_do_grupo = dados_opt[primeiro_item_do_grupo].get("Opções", [])
                
                # Adiciona cada opção como um novo grupo "OU"
                # Ex: ["CRE1212"], ["CRE1215"], etc.
                for materia_opcao in opcoes_do_grupo:
                    novos_prereqs_finais.append([materia_opcao]) 
            
            else:
                # É um grupo normal (ex: ["INF1037", "MAT4200"])
                # Apenas o readicionamos à lista
                novos_prereqs_finais.append(grupo_prereq)
        
        # Substitui os pré-requisitos antigos pelos novos, expandidos
        materia_info["prereqs_funcionais"] = novos_prereqs_finais    
    print("Expansão de pré-requisitos concluída.")
    return dados_mat_map

# --- FUNÇÕES DE CARREGAMENTO ---

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def carregar_dados_json():
    """Carrega todos os arquivos JSON de uma vez."""
    try:
        with open(os.path.join(BASE_DIR, "dados", "formacoes.json"), "r", encoding="utf-8") as f:
            dados_form = json.load(f)
        with open(os.path.join(BASE_DIR, "dados", "dominios.json"), "r", encoding="utf-8") as f:
            dados_dom = json.load(f)
        with open(os.path.join(BASE_DIR, "dados", "materias.json"), "r", encoding="utf-8") as f:
            lista_materias = json.load(f)
        with open(os.path.join(BASE_DIR, "dados", "optativas.json"), "r", encoding="utf-8") as f:
            dados_opt = json.load(f)
            
        # Mapeia matérias por código para acesso rápido
        dados_mat_map = {m["codigo"]: m for m in lista_materias}

        dados_mat_map = _criar_prerequisitos_funcionais(dados_mat_map, dados_opt)
        
        print("Dados JSON carregados com sucesso.")
        return dados_form, dados_dom, dados_mat_map, dados_opt, True
        
    except FileNotFoundError as e:
        print("Erro crítico: Não foi possível carregar os arquivos de dados: %s" % e)
        return {}, {}, {}, {}, False

# --- FUNÇÕES DE LÓGICA PURA ---

def coletarDados(formacoes: list, dominios: list, enfase_escolhida: str, dados_formacao: dict, dados_dominio: dict):
    """Coleta as matérias obrigatórias base (União)."""
    materias = set()
    for formacao in formacoes:
        if formacao in dados_formacao:
            materias.update(dados_formacao[formacao].get("obrigatórias", []))
            if enfase_escolhida:
                enfase_data = dados_formacao[formacao].get("enfase", {}).get(enfase_escolhida, {})
                materias.update(enfase_data.get("obrigatórias", []))
    for dominio in dominios:
        if dominio in dados_dominio:
            materias.update(dados_dominio[dominio].get("obrigatórias", []))
    return materias

def coletarGruposOptativos(formacoes: list, dominios: list, enfase_escolhida: str, dados_form: dict, dados_dom: dict):
    """Coleta e estrutura todos os grupos de optativas (Tronco Comum + Ênfase)."""
    grupos = {}
    
    # 1. Coleta do Tronco Comum (Optativas e Eletivas)
    for formacao in formacoes:
        if formacao in dados_form:
            formacao_data = dados_form[formacao]
            
            # Coleta Optativas do Tronco
            for grupo_opt in formacao_data.get("optativas", []):
                codigo_grupo, creditos_nec = grupo_opt[0], grupo_opt[1]
                if codigo_grupo not in grupos or grupos[codigo_grupo]["creditos_necessarios"] < creditos_nec: 
                    grupos[codigo_grupo] = {
                        "creditos_necessarios": creditos_nec, "creditos_atuais": 0,
                        "materias_cursadas": [], "fonte": "Optativa de %s" % formacao
                    }
            
            # Coleta Eletivas do Tronco
            for grupo_ele in formacao_data.get("eletivas", []):
                codigo_grupo, creditos_nec = grupo_ele[0], grupo_ele[1]
                if codigo_grupo not in grupos or grupos[codigo_grupo]["creditos_necessarios"] < creditos_nec: 
                    grupos[codigo_grupo] = {
                        "creditos_necessarios": creditos_nec, "creditos_atuais": 0,
                        "materias_cursadas": [], "fonte": "Eletiva de %s" % formacao
                    }
            
            # 2. Coleta da Ênfase (se houver)
            if enfase_escolhida:
                enfase_data = formacao_data.get("enfase", {}).get(enfase_escolhida, {})
                
                # Coleta Optativas da Ênfase
                for grupo_opt in enfase_data.get("optativas", []):
                    codigo_grupo, creditos_nec = grupo_opt[0], grupo_opt[1]
                    if codigo_grupo not in grupos or grupos[codigo_grupo]["creditos_necessarios"] < creditos_nec: 
                        grupos[codigo_grupo] = {
                            "creditos_necessarios": creditos_nec, "creditos_atuais": 0,
                            "materias_cursadas": [], "fonte": "Optativa de %s" % enfase_escolhida
                        }
                
                # Coleta Eletivas da Ênfase
                for grupo_ele in enfase_data.get("eletivas", []):
                    codigo_grupo, creditos_nec = grupo_ele[0], grupo_ele[1]
                    if codigo_grupo not in grupos or grupos[codigo_grupo]["creditos_necessarios"] < creditos_nec: 
                        grupos[codigo_grupo] = {
                            "creditos_necessarios": creditos_nec, "creditos_atuais": 0,
                            "materias_cursadas": [], "fonte": "Eletiva de %s" % enfase_escolhida
                        }

    # 3. Coleta dos Domínios
    for dominio in dominios:
        if dominio in dados_dom:
            for grupo_opt in dados_dom[dominio].get("optativas", []):
                codigo_grupo, creditos_nec = grupo_opt[0], grupo_opt[1]
                if codigo_grupo not in grupos or grupos[codigo_grupo]["creditos_necessarios"] < creditos_nec:
                    grupos[codigo_grupo] = {
                        "creditos_necessarios": creditos_nec, "creditos_atuais": 0,
                        "materias_cursadas": [], "fonte": "Optativa de %s" % dominio
                    }
                     
    return grupos

def materia_esta_liberada(codigo_materia, obrigatorias_set, dados_mat_map):
    """Verifica se os pré-requisitos da matéria estão no set fornecido."""
    materia_info = dados_mat_map.get(codigo_materia)
    
    if not materia_info:
        return False
        
    prereqs_grupos = materia_info.get("prereqs", [[]])
    
    if not prereqs_grupos or prereqs_grupos == [[]]:
        return True
        
    for grupo_prereq in prereqs_grupos:
        if not grupo_prereq: return True 
        grupo_valido = True
        for materia_prereq in grupo_prereq:
            if materia_prereq not in obrigatorias_set:
                grupo_valido = False
                break
        if grupo_valido: return True
            
    return False

# --- FUNÇÃO PRINCIPAL DE PROCESSAMENTO (ATUALIZADA) ---

# (Substitua sua função 'processar_selecao')
def processar_selecao(formacoes, dominios, enfase_escolhida, materias_pre_selecionadas, dados_form, dados_dom, dados_mat_map, dados_opt):
    """
    Função principal que roda toda a lógica de backend.
    Recebe as seleções do usuário e retorna o estado calculado.
    """
    
    # 1. Pega obrigatórias base (JÁ INCLUI ÊNFASE)
    materias_obrigatorias_base = coletarDados(
        formacoes, dominios, enfase_escolhida, dados_form, dados_dom
    )
    
    # 2. Adiciona pré-selecionadas
    materias_obrigatorias_set = materias_obrigatorias_base.union(set(materias_pre_selecionadas))
    
    optativas_manuais = set(materias_pre_selecionadas) - materias_obrigatorias_base
    
    # 3. Coleta grupos (JÁ INCLUI ÊNFASE)
    grupos_a_preencher = coletarGruposOptativos(
        formacoes, dominios, enfase_escolhida, dados_form, dados_dom
    )
    
    # (O restante da função 'processar_selecao' continua EXATAMENTE IGUAL...)
    # ... (bloco 'for codigo_grupo, info_grupo in grupos_a_preencher.items():')
    # ... (bloco 'while True:')
    # ... (bloco '5. Preparar o retorno')
    
    for codigo_grupo, info_grupo in grupos_a_preencher.items():
        if codigo_grupo in dados_opt:
            opcoes_do_grupo = set(dados_opt[codigo_grupo].get("Opções", []))
            materias_ja_cursadas = materias_obrigatorias_set.intersection(opcoes_do_grupo)
            
            for materia_codigo in materias_ja_cursadas:
                if materia_codigo not in info_grupo["materias_cursadas"]:
                    info_grupo["materias_cursadas"].append(materia_codigo)
                    info_grupo["creditos_atuais"] += dados_mat_map.get(materia_codigo, {}).get("creditos", 0)

    materias_optativas_automaticas = [] 
    
    while True:
        grupos_pendentes = []
        pool_de_opcoes = []
        
        for codigo_grupo, info_grupo in grupos_a_preencher.items():
            creditos_nec = info_grupo.get("creditos_necessarios", 0)
            creditos_atu = info_grupo.get("creditos_atuais", 0)
            
            if creditos_atu < creditos_nec:
                creditos_faltando = creditos_nec - creditos_atu
                grupos_pendentes.append( (codigo_grupo, creditos_faltando) )
                
                if codigo_grupo in dados_opt:
                    opcoes = dados_opt[codigo_grupo].get("Opções", [])
                    for materia_opt in opcoes:
                        if materia_opt not in materias_obrigatorias_set and \
                           materia_esta_liberada(materia_opt, materias_obrigatorias_set, dados_mat_map):
                            pool_de_opcoes.append(materia_opt)
                            
        if not grupos_pendentes: break

        contador_materias = defaultdict(int)
        for materia in pool_de_opcoes: contador_materias[materia] += 1
        
        repetidas_lista = [(m, c) for m, c in contador_materias.items() if c > 1]
        if not repetidas_lista: break
            
        estudo_materias = []
        for materia_codigo, contagem in repetidas_lista:
            materia_info = dados_mat_map.get(materia_codigo)
            if not materia_info: continue
            
            creditos_da_materia = materia_info.get("creditos", 0)
            grupos_que_mata = 0
            grupos_que_aplica = []
            
            for codigo_grupo, creditos_faltando in grupos_pendentes:
                if codigo_grupo in dados_opt:
                    opcoes = set(dados_opt[codigo_grupo].get("Opções", []))
                    if materia_codigo in opcoes:
                        grupos_que_aplica.append(codigo_grupo)
                        if creditos_da_materia >= creditos_faltando:
                            grupos_que_mata += 1
                            
            estudo_materias.append({
                "materia": materia_codigo, "creditos": creditos_da_materia,
                "aparece_em_N_grupos": contagem, "mata_N_grupos": grupos_que_mata,
                "grupos_que_aplica": grupos_que_aplica
            })
            
        if not estudo_materias: break

        estudo_materias.sort(key=lambda e: (-e['mata_N_grupos'], -e['aparece_em_N_grupos'], e['creditos']))
        
        materia_para_adicionar_info = estudo_materias[0]
        materia_codigo = materia_para_adicionar_info["materia"]
        materia_creditos = materia_para_adicionar_info["creditos"]
        grupos_que_aplica = materia_para_adicionar_info["grupos_que_aplica"]

        materias_optativas_automaticas.append(materia_codigo)
        materias_obrigatorias_set.add(materia_codigo) 

        for codigo_grupo in grupos_que_aplica:
            info_grupo = grupos_a_preencher[codigo_grupo]
            if materia_codigo not in info_grupo["materias_cursadas"]:
                info_grupo["materias_cursadas"].append(materia_codigo)
                info_grupo["creditos_atuais"] += materia_creditos
    
    materias_obrigatorias_finais = list(materias_obrigatorias_base)
    optativas_finais = list(set(materias_optativas_automaticas) | optativas_manuais)

    grupos_pendentes_finais = []
    for codigo_grupo, info_grupo in sorted(grupos_a_preencher.items()):
        if info_grupo["creditos_atuais"] < info_grupo["creditos_necessarios"]:
            grupos_pendentes_finais.append({
                "codigo_grupo": codigo_grupo,
                "faltando": info_grupo["creditos_necessarios"] - info_grupo["creditos_atuais"],
                "fonte": info_grupo["fonte"]
            })
            
    return materias_obrigatorias_finais, optativas_finais, grupos_pendentes_finais