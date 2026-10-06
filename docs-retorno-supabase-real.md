# Retorno seguro ao Supabase real

A Preview usa fixtures somente quando o hostname começa com `nativo-site-git-refactor-teach-` ou quando `VITE_VISUAL_PREVIEW=true`. O domínio oficial não entra nesse modo automaticamente.

## Procedimento recomendado

1. **Não altere as credenciais do Supabase.** Mantenha na Vercel os valores que já funcionavam:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` somente para funções/server, nunca no bundle do navegador.
2. Na Vercel, abra o projeto correto (`nativo-site`) e confira a configuração para o ambiente que será publicado: **Production** ou **Preview**, conforme o teste.
3. Remova ou desative `VITE_VISUAL_PREVIEW=true` no ambiente que será testado com dados reais.
4. Publique uma nova build; variáveis `VITE_*` só entram no bundle durante o build.
5. Rode localmente, se as variáveis públicas estiverem disponíveis no shell:

   ```bash
   ./scripts/prepare-supabase-real.sh --build
   ```

6. Teste com uma conta de professor real, nesta ordem:
   - login e logout;
   - Agenda e navegação de mês;
   - abrir detalhes, criar/editar aula e disponibilidade;
   - Financeiro e período da NFS-e;
   - upload de nota fiscal;
   - Meu perfil, salvar e descartar.
7. Só depois do teste com dados reais, faça o merge da branch para `main`.

## O que o script verifica

`./scripts/prepare-supabase-real.sh --check` valida apenas a presença das variáveis públicas, HTTPS no URL e ausência do modo visual forçado. `--build` executa também `npm run lint` e `npm run build`.

O script **não imprime valores secretos**, não altera variáveis na Vercel e não modifica o banco. A service role key continua sendo responsabilidade das funções Vercel e não deve ser adicionada a `VITE_*`.

## Remoção futura dos fixtures

Depois que o retorno ao Supabase real for aprovado, os fixtures podem ser removidos em um commit separado. Antes disso, não remova `previewFixture`: ele mantém a Preview visual reproduzível e não interfere no domínio oficial.
