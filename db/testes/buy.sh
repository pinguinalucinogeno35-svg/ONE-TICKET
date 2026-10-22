#!/bin/sh
psql -qtA -d ingressos -c "select test_buy('$1', $2)"
