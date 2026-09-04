# Compras — Apartamento GB

App simples e compartilhado para Ivan e Giovana decidirem, item a item, o que fica, sai ou
troca na lista de compras do apartamento. Sincroniza em tempo real via Supabase Realtime.
A etapa de cotações reúne os itens marcados como `FICA` e registra foto, preço, loja e link
do produto escolhido.

## Stack

- Next.js 15 (App Router) + TypeScript
- Supabase (Postgres + Realtime), tabela `public.shopping_items`
- Sem autenticação tradicional — um código de acesso simples protege a interface (ver abaixo)

## Variáveis de ambiente

| Variável | Descrição |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon/publishable (segura para o navegador) |
| `APP_ACCESS_CODE` | Código que Ivan e Giovana digitam para entrar no app |
| `SESSION_SECRET` | Segredo aleatório usado para assinar o cookie de sessão |

Nenhuma dessas variáveis deve conter a `service_role key` do Supabase.

## Segurança

As policies de RLS da tabela liberam SELECT e UPDATE para o papel `anon`, sem outra
restrição — é o desenho pedido para o app funcionar sem autenticação tradicional. Como isso
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
