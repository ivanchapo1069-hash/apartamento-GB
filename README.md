# Compras — Apartamento GB

App simples e compartilhado para Ivan e Giovana tocarem o apartamento: decidir o que fica,
cotar o que ficou e acompanhar os contratos e pagamentos da obra. Sincroniza em tempo real
via Supabase Realtime.

- **Decisões** — item a item, o que fica, sai ou troca.
- **Cotações** — os itens marcados como `FICA`, com foto, preço, loja e link do produto.
- **Obra** — contratos de serviço (arquiteta, marcenaria, empreiteiro) e suas parcelas.
- **Orçamento** — de onde vem o dinheiro, quanto já saiu e se sobra ou estoura no fim.

Em `/relatorio` o app monta uma prestação de contas fechada, para imprimir ou salvar em PDF.

## Stack

- Next.js 15 (App Router) + TypeScript
- Supabase (Postgres + Realtime), tabelas `public.shopping_items`, `public.obra_contratos`,
  `public.obra_parcelas` e `public.orcamento_entradas`
- Sem autenticação tradicional — um código de acesso simples protege a interface (ver abaixo)

## Variáveis de ambiente

| Variável | Descrição |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon/publishable (segura para o navegador) |
| `APP_ACCESS_CODE` | Código que Ivan e Giovana digitam para entrar no app |
| `SESSION_SECRET` | Segredo aleatório usado para assinar o cookie de sessão |
| `GEMINI_API_KEY` | Chave da Gemini API, usada só no servidor para a busca automática de preço |
| `GEMINI_QUOTE_MODEL` | Opcional — modelo Gemini para a busca (padrão `gemini-3.6-flash`) |

Nenhuma dessas variáveis deve conter a `service_role key` do Supabase.

## Cotação automática

Na etapa "Cotações", o botão "Buscar melhor preço" chama `app/api/quote/search/route.ts`, que
usa a Gemini API com busca do Google (grounding) para procurar o preço atual do item em lojas
brasileiras conhecidas e devolve preço, loja, link do produto e foto. É uma busca por IA, não
uma comparação estruturada de preços — pode falhar ou vir impreciso; por isso os campos
continuam editáveis manualmente, e o botão "Buscar novamente" permite tentar de novo. Sem
`GEMINI_API_KEY` configurada, o botão retorna erro e a cotação manual continua funcionando
normalmente.

## Acompanhamento de obra

A aba "Obra" controla contratos de serviço e o pagamento de cada parcela.

**A decisão que sustenta o resto: não existe campo "status" na parcela.** O banco guarda
fatos — `pago_em`, `vencimento`, `marco_entregue_em` — e `lib/obra.ts` deriva o estado na
hora de exibir (`statusParcela`). Um campo gravado com "atrasado" ficaria velho no dia
seguinte e dependeria de alguém lembrar de atualizar; assim a tela nunca mente.

Parcela tem dois gatilhos possíveis:

| Gatilho | Quando vence |
| --- | --- |
| `data` | Na data fixa em `vencimento`, como no contrato |
| `marco` | Só depois que a entrega acontece: `marco_entregue_em + prazo_dias` |

Enquanto o marco não é marcado como entregue, a parcela fica "aguardando entrega" e **não
conta como atraso** — é o caso de "30% na entrega do projeto executivo", que não tem data
até a arquiteta entregar.

Fora de escopo por enquanto, porque cada um é mais um campo para manter atualizado: aditivo
de contrato, retenção técnica, reajuste por índice e rateio entre as duas pessoas.

## Orçamento

A aba "Orçamento" junta o dinheiro que estava espalhado em três lugares que não se falavam:
contratos de obra, itens de compra cotados e iluminação.

| Número | Fórmula | O que responde |
| --- | --- | --- |
| Orçamento | entradas recebidas + previstas | Quanto existe no total |
| Realizado | parcelas pagas + itens comprados | Quanto já saiu da conta |
| Saldo real | entradas recebidas − realizado | Quanto tem hoje, de verdade |
| Projetado | orçamento − (realizado + comprometido) | Sobra ou estoura no fim |

Duas regras sustentam a honestidade dessas contas:

**Cotado não é comprado.** `shopping_items.comprado_em` e `valor_pago` registram a compra
efetiva. Enquanto o item está só cotado ele conta como *comprometido*, nunca como *realizado*.
Quando o pago difere do cotado, o card mostra quanto se economizou ou estourou.

**O que não se sabe nunca vira zero.** Itens que ficam mas ainda não têm preço aparecem como
um aviso próprio ("12 itens ainda sem cotação") e ficam **fora de todas as somas**. Um
projetado que trata buraco como R$ 0 mente a favor de quem lê.

A entrada segue o mesmo desenho da parcela: só `recebido_em` é gravado; previsto e atrasado
são derivados em `lib/orcamento.ts`. Entrada prevista entra no orçamento total e na projeção,
mas fica de fora do saldo real — saldo só considera dinheiro que já existe na conta.

Iluminação entra nas contas como comprometido, mas ainda não tem tela no app, então não há
como marcá-la como comprada pela interface. A tabela mostra isso explicitamente.

## Relatório de prestação de contas

`/relatorio` monta um documento para entregar a quem está bancando a reforma: resumo dos
números, entradas lançadas, pagamentos realizados em ordem cronológica, o que está em aberto
mês a mês e as compras escolhidas agrupadas por ambiente.

A saída é o próprio diálogo de impressão do navegador (`window.print()` sobre um bloco
`@media print` em `app/globals.css`) — no celular isso vira "Salvar em PDF" ou compartilhar
direto. Sem biblioteca de PDF, sem renderização no servidor.

Duas decisões do CSS de impressão valem nota:

- **Nada depende de fundo colorido.** Impressora P&B e `print-color-adjust` não confiável
  fariam um chip "Pago" sumir dentro de um bloco escuro; no print tudo é texto e borda.
- **A rota fica atrás do código de acesso.** Ao contrário de `/cotacao`, que é público de
  propósito para mandar a fornecedor, o relatório é dado financeiro da família e não entra em
  `PUBLIC_PATHS` no `middleware.ts`.

O documento declara o que não sabe: os itens que ficam mas ainda não têm cotação aparecem em
seção própria, fora de todos os totais. Prestação de contas que esconde buraco não presta
contas.

## Segurança

As policies de RLS liberam as operações para o papel `anon`, sem outra restrição — é o
desenho pedido para o app funcionar sem autenticação tradicional. As tabelas de obra e de
orçamento seguem o mesmo padrão das `shopping_items`, incluindo DELETE, porque o app precisa
excluir contratos, parcelas e entradas. Como isso
por si só deixaria a tabela editável por qualquer pessoa que descobrisse a URL do Supabase e a
chave anon (visível no bundle do navegador), o app adiciona uma trava simples e apropriada
para uso familiar: toda a interface fica atrás de um código de acesso (`APP_ACCESS_CODE`),
verificado em `/api/login`, que libera um cookie `httpOnly` checado pelo `middleware.ts` em
toda rota. `robots.txt` também bloqueia indexação.

Isso não é proteção de nível bancário — para dados sensíveis, o próximo passo seria Supabase
Auth com policies por usuário. Para uma lista de decisões de compra de eletrodomésticos, entre
duas pessoas, é proporcional.

## Desenvolvimento local

```bash
npm install
cp .env.example .env.local # preencha os valores
npm run dev
```
