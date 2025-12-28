from flask import Flask, request, jsonify
from flask_cors import CORS
from . import dados 

# --- Inicialização do Servidor ---
app = Flask(__name__)
# Permite que o frontend (JS) acesse o backend (Python)
CORS(app) 

# Carrega todos os dados dos JSONs UMA VEZ quando o servidor inicia
print("Carregando dados JSON...")
dados_form, dados_dom, dados_mat_map, dados_opt, DADOS_CARREGADOS = dados.carregar_dados_json()

if not DADOS_CARREGADOS:
    print("ERRO CRÍTICO: Servidor não pode iniciar sem os arquivos JSON.")
    
# --- Endpoint 1: Processamento Principal ---
@app.route("/api/processar-estado", methods=['POST'])
def api_processar_estado():
    """
    Endpoint principal. Recebe a seleção do usuário E o estado atual do board,
    retorna todas as matérias obrigatórias, as escolhidas automaticamente,
    e os grupos que ainda precisam de escolha manual.
    """
    if not DADOS_CARREGADOS:
        return jsonify({"erro": "Erro no servidor, dados não carregados"}), 500
        
    data = request.json
    formacoes = data.get('formacoes', [])
    dominios = data.get('dominios', [])
    
    enfase_escolhida = data.get('enfase_escolhida', None)
    pre_selecionadas = data.get('pre_selecionadas', []) 

    print("API: /api/processar-estado chamado")
    
    obrigatorias_cods, optativas_cods, grupos_pendentes = dados.processar_selecao(
        formacoes, dominios, enfase_escolhida, pre_selecionadas,
        dados_form, dados_dom, dados_mat_map, dados_opt
    )

    obrigatorias_obj = [dados_mat_map[cod] for cod in obrigatorias_cods if cod in dados_mat_map]
    optativas_obj = [dados_mat_map[cod] for cod in optativas_cods if cod in dados_mat_map]

    return jsonify({
        "obrigatorias": obrigatorias_obj,
        "optativas_escolhidas": optativas_obj,
        "grupos_pendentes": grupos_pendentes 
    })

# --- Endpoint 2: Formulário de Optativas ---
@app.route('/api/get-opcoes-grupo', methods=['POST'])
def api_get_opcoes_grupo():
    """
    Endpoint do "formulário". Recebe um código de grupo e o estado atual do board,
    retorna a lista de matérias VÁLIDAS e LIBERADAS para aquele grupo.
    """
    if not DADOS_CARREGADOS:
        return jsonify({"erro": "Erro no servidor, dados não carregados"}), 500
        
    data = request.json
    codigo_grupo = data.get('codigo_grupo')
    materias_cursadas_set = set(data.get('materias_cursadas_set', [])) 

    print("API: /api/get-opcoes-grupo chamado para %s" % codigo_grupo)

    if not codigo_grupo:
        return jsonify({"erro": "Nenhum codigo_grupo fornecido"}), 400

    opcoes_do_grupo = dados_opt.get(codigo_grupo, {}).get("Opções", [])
    opcoes_validas = []

    for materia_cod in opcoes_do_grupo:
        # Só mostra se:
        # 1. Não está no set de "já cursadas"
        # 2. Está liberada pelos pré-requisitos
        if materia_cod not in materias_cursadas_set and \
           dados.materia_esta_liberada(materia_cod, materias_cursadas_set, dados_mat_map):
            
            if materia_cod in dados_mat_map:
                opcoes_validas.append(dados_mat_map[materia_cod])
            else:
                # Aviso (API): Matéria %s do grupo %s não encontrada em materias.json
                pass
    
    # Ordena as opções alfabeticamente pelo nome
    opcoes_validas.sort(key=lambda m: m.get('nome', ''))
    
    return jsonify(opcoes_validas)

# --- Endpoint 3: Enviar dados de Formações ---
@app.route("/api/get-formacoes", methods=['GET'])
def api_get_formacoes():
    """
    Envia a lista completa de formações e suas ênfases.
    """
    if not DADOS_CARREGADOS:
        return jsonify({"erro": "Erro no servidor, dados não carregados"}), 500
    
    return jsonify(dados_form)

# --- Endpoint 4: Enviar dados de Domínios ---
@app.route("/api/get-dominios", methods=['GET'])
def api_get_dominios():
    return jsonify(dados_dom)

# --- Endpoint 5: Enviar TODAS as matérias (Para o Grafo) ---
@app.route("/api/get-todas-materias", methods=['GET'])
def api_get_todas_materias():
    """
    Retorna a lista completa de matérias carregadas no sistema.
    Usado para renderizar o grafo de dependências.
    """
    if not DADOS_CARREGADOS:
        return jsonify({"erro": "Dados não carregados"}), 500
    
    # dados_mat_map é um dicionário { 'COD': {Objeto} }
    # O frontend espera uma lista [ {Objeto}, {Objeto} ]
    lista_materias = list(dados_mat_map.values())
    
    return jsonify(lista_materias)

# --- Endpoint 6: Enviar dicionário de Optativas (Para validação de grupos no Frontend) ---
@app.route("/api/get-dados-optativas", methods=['GET'])
def api_get_dados_optativas():
    """
    Retorna o JSON completo de optativas para que o JS possa 
    resolver dependências de grupos (Ex: saber que INF1037 satisfaz INF0307).
    """
    if not DADOS_CARREGADOS:
        return jsonify({"erro": "Dados não carregados"}), 500
    
    return jsonify(dados_opt)