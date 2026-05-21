#!/usr/bin/env bash
# Fires relays 1-9 in sequence, 800ms on each, to prove the full chain works.
set -u
PORT=/dev/serial0   # via systemd symlink → ttyAMA0
BAUD=38400

i2c_set() {   # i2c_set <relay 1-3> <0|1>
  3relind 0 write "$1" "$2" > /dev/null
}
mb_set() {    # mb_set <addr 2|3> <relay 1-3> <0|1>
  mbpoll -m rtu -b "$BAUD" -P none -1 -a "$1" -r "$2" -t 0 "$PORT" "$3" > /dev/null
}
all_off() {
  for r in 1 2 3; do i2c_set "$r" 0; done
  for a in 2 3; do for r in 1 2 3; do mb_set "$a" "$r" 0; done; done
}

trap all_off EXIT
all_off

# Machine 1..9 → (transport, board, relay)
seq_steps=(
  "i2c 0 1" "i2c 0 2" "i2c 0 3"
  "mb 2 1" "mb 2 2" "mb 2 3"
  "mb 3 1" "mb 3 2" "mb 3 3"
)

for n in "${!seq_steps[@]}"; do
  read t a r <<< "${seq_steps[$n]}"
  m=$((n+1))
  echo "Machine $m → board $a relay $r ($t) ON"
  if [ "$t" = "i2c" ]; then i2c_set "$r" 1; else mb_set "$a" "$r" 1; fi
  sleep 0.8
  if [ "$t" = "i2c" ]; then i2c_set "$r" 0; else mb_set "$a" "$r" 0; fi
  sleep 0.2
done
echo "Done."
