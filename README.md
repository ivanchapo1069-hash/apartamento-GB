# Compras — Apartamento GB

App simples e compartilhado para Ivan e Giovana tocarem o apartamento: decidir o que fica,
cotar o que ficou e acompanhar os contratos e pagamentos da obra. Sincroniza em tempo real
via Supabase Realtime.

- **Decisões** — item a item, o que fica, sai ou troca.
- **Cotações** — os itens marcados como `FICA`, com foto, preço, loja e link do produto.
- **Obra** — contratos de serviço (arquiteta, marcenaria, empreiteiro) e suas parcelas.

## Stack

- Next.js 15 (App Router) + TypeScript
- Supabase (Postgres + Realtime), tabelas `public.shopping_items`, `public.obra_contratos`
  e `public.obra_parcelas`
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

## Segurança

As policies de RLS liberam as operações para o papel `anon`, sem outra restrição — é o
desenho pedido para o app funcionar sem autenticação tradicional. As tabelas de obra seguem
o mesmo padrão das `shopping_items`, incluindo DELETE, porque o app precisa excluir
contratos e parcelas. Como isso
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
