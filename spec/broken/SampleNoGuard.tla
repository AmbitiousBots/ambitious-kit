--------------------------- MODULE SampleNoGuard ---------------------------
EXTENDS Naturals

CONSTANT Capacity

VARIABLE used

Init == used = 0

Add ==
    used' = used + 1

Remove ==
    /\ used > 0
    /\ used' = used - 1

Next == Add \/ Remove

Spec == Init /\ [][Next]_used

WithinCapacity == used <= Capacity
=============================================================================
