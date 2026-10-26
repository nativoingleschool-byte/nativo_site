# Reminder — implantação segura de substituições e Web Push

**Estado:** branch de preview. Não execute em produção sem uma homologação completa.

## Mudanças de banco
A migração `20261026190000_substitution_lessons_and_web_push.sql` permite `student_id IS NULL` **somente** quando `lesson_kind='substitution'`, com RLS restrita ao professor dono da aula (ou administrador). Ela também cria `push_subscriptions` e `push_delivery_log`, sem permissões REST diretas para `anon` ou `authenticated`. Antes de aplicar, verificar todos os leitores de `lessons.student_id` e testar contagem financeira, exclusão, consultas da agenda, notificações e aula recorrente.

## Ativação do Push (não foi feita)
1. Preparar ambiente de homologação Supabase isolado e aplicar a migração nele.
2. Gerar par de chaves VAPID por um processo local seguro. Nunca colocar chave privada ou segredo no repositório.
3. Configurar na Vercel, no ambiente correspondente: `VAPID_PUBLIC_KEY`. Configurar no Supabase Edge Function: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto: de suporte) e `PUSH_DISPATCH_SECRET` aleatório e longo. O Supabase injeta `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` na Edge Function.
4. Implantar `push-reminders` com `verify_jwt=false` **somente nessa função**; ela valida o header Authorization contra `PUSH_DISPATCH_SECRET`.
5. Configurar Supabase Cron (ou pg_cron + pg_net + Vault) para chamar a função a cada minuto. Guardar o segredo no Vault; não colocá-lo como texto visível em migrations ou no agendador.
6. Em um app PWA de teste, conceder permissão de notificações por interação direta do usuário, ativar push e verificar inscrição gravada em `push_subscriptions`. Enviar um lembrete de teste para um dispositivo com o app fechado.
7. Validar entrega em Android, Windows e iOS instalado na Tela de Início (nas versões compatíveis); validar bloqueio e reativação, vários dispositivos, cliques e remoção de endpoints expirados.
8. Somente então autorizar ativação na produção.

## Comportamento e limites
- A central de avisos dentro do app continua separada do Web Push do dispositivo.
- A função envia até 500 aulas candidatas por execução e possui deduplicação por usuário/chave; avaliar paginação e capacidade antes de escalar.
- A função de envio usa janelas de cerca de cinco minutos; executar a cada minuto evita atrasos. Execuções que falham após a reserva reabrem a entrega quando nenhum dispositivo recebeu o push.
- Um usuário que já tinha `push_enabled=true` antes da mudança precisa se inscrever uma vez no novo mecanismo, desativando e reativando nas configurações.
- Sem migração, chaves VAPID, Edge Function e Cron configurados, **push remoto não estará operacional**, mesmo que uma build web esteja READY.
- Para rollback, desativar o Cron primeiro. Não restaurar `student_id NOT NULL` se houver substituições gravadas.
- Não usar aluno fictício como substituto.

## Critérios mínimos de aceite
- Criar aula normal sem aluno: rejeitada.
- Criar substituição sem aluno: gravada com `lesson_kind=substitution` e `student_id=null`.
- Criar substituição com usuário não-professor: rejeitada.
- Substituição aparece na agenda do professor, não aparece como aula de aluno e a contabilidade só computa aula concluída.
- Notificações do dispositivo chegam mesmo com o app fechado (em dispositivos compatíveis).
- O mesmo lembrete não é enviado repetidamente a cada execução do agendador.
- Desativar notificações impede novos envios; endpoints expirados são removidos.

Referência oficial: https://supabase.com/docs/guides/functions/schedule-functions e https://supabase.com/docs/guides/functions/auth
