-------------------------- MODULE GreetingsOverwrite --------------------------
EXTENDS Naturals, Sequences

CONSTANT MaxGreets

VARIABLES stored, accepted

vars == <<stored, accepted>>

Init == stored = <<>> /\ accepted = 0

Greet ==
    /\ accepted < MaxGreets
    /\ accepted' = accepted + 1
    /\ stored' = <<accepted + 1>>

List == UNCHANGED vars

Next == Greet \/ List

Spec == Init /\ [][Next]_vars

NothingLost == Len(stored) = accepted

OldestFirst == \A i \in 1..Len(stored) : stored[i] = i

=============================================================================
