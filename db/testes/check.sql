\pset footer off
select 'evento' as o, capacity, seats_sold, seats_reserved, half_sold, half_reserved,
  (select coalesce(sum(seats),0) from orders where status='paid') as pedidos_pagos,
  (select coalesce(sum(seats),0) from orders where status='pending') as pedidos_pendentes,
  (select count(*) from tickets) as ingressos
from events;
select name, status, quantity, sold, reserved,
  (select coalesce(sum(oi.seats),0) from order_items oi join orders o on o.id=oi.order_id where oi.batch_id=b.id and o.status='paid') as itens_pagos,
  (select coalesce(sum(oi.seats),0) from order_items oi join orders o on o.id=oi.order_id where oi.batch_id=b.id and o.status='pending') as itens_pend
from batches b order by position;
select
  bool_and(e.seats_sold = (select coalesce(sum(seats),0) from orders where status='paid')) and
  bool_and(e.seats_reserved = (select coalesce(sum(seats),0) from orders where status='pending')) and
  bool_and(e.seats_sold + e.seats_reserved <= e.capacity) and
  bool_and((select count(*) from tickets) = e.seats_sold) as contadores_ok
from events e;
