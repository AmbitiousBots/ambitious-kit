-------------------------- MODULE InstallLinkFirst --------------------------
EXTENDS Naturals

CONSTANT Versions

VARIABLES file, recorded, link, step, want, fetched

vars == <<file, recorded, link, step, want, fetched>>

NoVersion == 0

Init ==
    /\ file = [v \in Versions |-> "missing"]
    /\ recorded = {}
    /\ link = NoVersion
    /\ step = "idle"
    /\ want = NoVersion
    /\ fetched = "nothing"

Start(v) ==
    /\ step = "idle"
    /\ want' = v
    /\ step' = "checking"
    /\ UNCHANGED <<file, recorded, link, fetched>>

AlreadyInstalled ==
    /\ step = "checking"
    /\ file[want] = "good"
    /\ want \in recorded
    /\ link' = want
    /\ step' = "idle"
    /\ UNCHANGED <<file, recorded, want, fetched>>

Download(bytes) ==
    /\ step = "checking"
    /\ ~(file[want] = "good" /\ want \in recorded)
    /\ fetched' = bytes
    /\ step' = "fetched"
    /\ UNCHANGED <<file, recorded, link, want>>

RejectBadChecksum ==
    /\ step = "fetched"
    /\ fetched = "bad"
    /\ step' = "idle"
    /\ UNCHANGED <<file, recorded, link, want, fetched>>

Place ==
    /\ step = "linked"
    /\ file' = [file EXCEPT ![want] = IF fetched = "good" THEN "good" ELSE "unverified"]
    /\ step' = "placed"
    /\ UNCHANGED <<recorded, link, want, fetched>>

Record ==
    /\ step = "placed"
    /\ recorded' = recorded \cup {want}
    /\ step' = "idle"
    /\ UNCHANGED <<file, link, want, fetched>>

SwitchLink ==
    /\ step = "fetched"
    /\ fetched = "good"
    /\ link' = want
    /\ step' = "linked"
    /\ UNCHANGED <<file, recorded, want, fetched>>

Crash ==
    /\ step # "idle"
    /\ step' = "idle"
    /\ UNCHANGED <<file, recorded, link, want, fetched>>

Damage(v) ==
    /\ file[v] = "good"
    /\ file' = [file EXCEPT ![v] = "damaged"]
    /\ UNCHANGED <<recorded, link, step, want, fetched>>

Next ==
    \/ \E v \in Versions : Start(v) \/ Damage(v)
    \/ \E bytes \in {"good", "bad"} : Download(bytes)
    \/ AlreadyInstalled
    \/ RejectBadChecksum
    \/ Place
    \/ Record
    \/ SwitchLink
    \/ Crash

Spec == Init /\ [][Next]_vars

OnlyVerifiedAssetsInPlace == \A v \in Versions : file[v] # "unverified"

LinkNeverDangles == link # NoVersion => file[link] # "missing"

RecordedMeansInstalled == \A v \in recorded : file[v] # "missing"
=============================================================================
