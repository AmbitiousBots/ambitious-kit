------------------------------ MODULE RuntimeNoVerify ----------------------------
EXTENDS Naturals

VARIABLES final, staging, step, lock, source

vars == <<final, staging, step, lock, source>>

Init ==
    /\ final = "missing"
    /\ staging = "missing"
    /\ step = "idle"
    /\ lock = "nothing"
    /\ source = "nothing"

Start ==
    /\ step = "idle"
    /\ step' = "checking"
    /\ UNCHANGED <<final, staging, lock, source>>

AlreadyBuilt ==
    /\ step = "checking"
    /\ final = "marked"
    /\ step' = "idle"
    /\ UNCHANGED <<final, staging, lock, source>>

Download(bytes) ==
    /\ step = "checking"
    /\ final # "marked"
    /\ lock' = bytes
    /\ step' = "fetched"
    /\ UNCHANGED <<final, staging, source>>

RejectBadLock ==
    /\ step = "fetched"
    /\ lock = "bad"
    /\ step' = "idle"
    /\ UNCHANGED <<final, staging, lock, source>>

Stage ==
    /\ step = "fetched"
    /\ staging' = "partial"
    /\ source' = lock
    /\ step' = "staged"
    /\ UNCHANGED <<final, lock>>

Fill(result) ==
    /\ step = "staged"
    /\ staging' = IF result = "built" THEN "built" ELSE "missing"
    /\ step' = IF result = "built" THEN "filled" ELSE "idle"
    /\ UNCHANGED <<final, lock, source>>

Mark ==
    /\ step = "filled"
    /\ staging' = "marked"
    /\ step' = "marked"
    /\ UNCHANGED <<final, lock, source>>

MoveIntoPlace ==
    /\ step = "marked"
    /\ final' = staging
    /\ staging' = "missing"
    /\ step' = "idle"
    /\ UNCHANGED <<lock, source>>

Crash ==
    /\ step # "idle"
    /\ step' = "idle"
    /\ UNCHANGED <<final, staging, lock, source>>

Next ==
    \/ Start
    \/ AlreadyBuilt
    \/ \E bytes \in {"good", "bad"} : Download(bytes)
    \/ RejectBadLock
    \/ Stage
    \/ \E result \in {"built", "failed"} : Fill(result)
    \/ Mark
    \/ MoveIntoPlace
    \/ Crash

Spec == Init /\ [][Next]_vars

InPlaceMeansComplete == final \in {"missing", "marked"}

OnlyVerifiedLockIsBuilt == staging # "missing" => source = "good"
=============================================================================
