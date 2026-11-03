const MESSAGES = {
  EVENTO_ESGOTADO: 'Ingressos esgotados para este evento.',
  EVENTO_FORA_DE_VENDA: 'As vendas deste evento estão fechadas.',
  LOTE_ESGOTADO: 'Não há ingressos suficientes neste lote. Diminua a quantidade.',
  LOTE_INDISPONIVEL: 'Este lote acabou de virar. Atualize a página para ver o preço novo.',
  MEIA_ESGOTADA: 'A cota de meia-entrada esgotou.',
  LIMITE_POR_COMPRA: 'Máximo de 8 pessoas por compra.',
  OFERTA_INVALIDA: 'Escolha pelo menos um ingresso.',
  CUPOM_INVALIDO: 'Cupom inválido ou expirado.',
  CUPOM_ESGOTADO: 'Este cupom atingiu o limite de usos.',
  INGRESSO_INDISPONIVEL: 'Este ingresso não pode ser transferido.',
  PEDIDO_NAO_ENCONTRADO: 'Pedido não encontrado.',
  NAO_AUTORIZADO: 'Acesso não autorizado.',
  CONFIG_AUSENTE: 'O servidor não está configurado.',
  PAGAMENTO_RECUSADO: 'Pagamento recusado. Tente outro cartão ou pague com Pix.',
  ERRO_PAGAMENTO: 'Não foi possível falar com o meio de pagamento. Tente de novo.',
  QUANTIDADE_ABAIXO_DO_VENDIDO: 'A quantidade não pode ser menor que o já vendido e reservado neste lote.',
  LOTE_NAO_ENCONTRADO: 'Lote não encontrado.',
  EVENTO_NAO_ENCONTRADO: 'Evento não encontrado.',
  PRECO_INVALIDO: 'Preço inválido.',
  CODIGO_INVALIDO: 'Código do cupom: de 3 a 30 letras, números, - ou _.',
  VALOR_INVALIDO: 'Valor do desconto inválido (percentual de 1 a 100, valor fixo maior que zero).',
  CUPOM_DUPLICADO: 'Já existe um cupom com esse código neste evento.',
  LIMITE_ABAIXO_DO_USO: 'O limite não pode ser menor que os usos já feitos.',
  DADOS_INVALIDOS: 'Confira os campos preenchidos.',
  ACAO_INVALIDA: 'Ação inválida.',
  VENDA_NAO_ENCONTRADA: 'Venda não encontrada.',
  PRODUTO_DUPLICADO: 'Já existe um produto com esse nome.',
  PRODUTO_NAO_ENCONTRADO: 'Produto não encontrado.',
  QUANTIDADE_INVALIDA: 'Informe caixas ou unidades.',
  HORARIO_INVALIDO: 'O fim do show precisa ser depois do início.',
  SHOW_NAO_ENCONTRADO: 'Show não encontrado.',
  CREDENCIAIS_INVALIDAS: 'Login ou senha incorretos.',
  ACESSO_BLOQUEADO: 'Muitas tentativas erradas. Tente de novo em 10 minutos.',
  ACESSO_OUTRO_SISTEMA: 'Este acesso é do outro sistema.',
  LOGIN_DUPLICADO: 'Já existe alguém com esse login.',
  SENHA_CURTA: 'A senha precisa ter pelo menos 6 caracteres.',
  ULTIMO_PRODUTOR: 'É preciso manter pelo menos um produtor ativo.',
  ACESSO_NAO_ENCONTRADO: 'Acesso não encontrado.',
  ENDERECO_INVALIDO: 'Endereço do evento: de 3 a 60 letras minúsculas, números e hífen (ex.: sexta-no-bosque).',
  ENDERECO_DUPLICADO: 'Já existe um evento com esse endereço.',
  ENDERECO_COM_VENDAS: 'O endereço não muda depois da primeira venda: o link já foi divulgado.',
  DATA_INVALIDA: 'O término precisa ser depois do início.',
  IMAGEM_INVALIDA: 'A imagem precisa ser um link que comece com https://.',
  COTA_MEIA_INVALIDA: 'Cota de meia-entrada inválida: entre o que já foi vendido e a capacidade.',
  CAPACIDADE_ABAIXO_DO_VENDIDO: 'A capacidade não pode ser menor que o já vendido e reservado.',
  SEM_LOTE_ATIVO: 'Para abrir as vendas, crie um lote com preço em Lotes e preços.',
  EVENTO_COM_VENDAS: 'Evento com vendas não volta para rascunho. Use Pausar.',
  SEM_PERMISSAO: 'Seu acesso não permite esta ação.',
  ERRO_INTERNO: 'Algo deu errado. Tente de novo em instantes.',
};

export function messageFor(code) {
  return MESSAGES[code] || MESSAGES.ERRO_INTERNO;
}

export function errorResponse(err, status = 400) {
  const code = err?.code || 'ERRO_INTERNO';
  if (code === 'ERRO_INTERNO') console.error(err);
  return Response.json({ error: code, message: messageFor(code) }, { status });
}
