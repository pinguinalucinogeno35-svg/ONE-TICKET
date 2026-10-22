#!/bin/sh
# Roda os testes do schema num Postgres local (15+). Uso: ./rodar_testes.sh
# Requer psql com acesso para criar o banco "ingressos".
set -e
cd "$(dirname "$0")"
dropdb --if-exists ingressos && createdb ingressos
psql -q -v ON_ERROR_STOP=1 -d ingressos -f stub.sql -f ../001_schema_mvp.sql -f seed.sql

echo "== 400 compras simultâneas (60 em paralelo) para 100 vagas =="
python3 -c "
import random; random.seed(7)
for i in range(400):
    r = random.random()
    print('inteira %d' % random.randint(1,3) if r < .6 else 'meia %d' % random.randint(1,2) if r < .8 else 'casadinha 1')
" | xargs -P 60 -L 1 ./buy.sh | sort | uniq -c
psql -d ingressos -f check.sql

echo "== Confirma metade (2x cada), vence o resto =="
psql -q -d ingressos -c "select count(*) as confirmados from (select confirm_order(id) from orders where status='pending' and random() < 0.5) x"
psql -q -d ingressos -c "select count(*) from (select confirm_order(id) from orders where status='paid') x"
psql -q -d ingressos -c "update orders set expires_at = now() - interval '1 minute' where status='pending'; select cron_tick();"
psql -d ingressos -f check.sql

echo "== Cenários de regra de negócio =="
psql -q -d ingressos -f scen.sql
