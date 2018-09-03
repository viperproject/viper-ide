open util/boolean
open util/ternary
open util/integer
open util/relation

sig Snap {}
one sig Unit extends Snap {}

sig SortWrapper extends Snap {
    wrapped: one univ
}

pred sortwrapper_new [ e: univ, sw: Snap] {
    sw in SortWrapper
    sw.wrapped = e
}

abstract sig Combine extends Snap {
    left: one Snap,
    right: one Snap
}

pred combine [ l, r: Snap, c: Combine ] {
    c.left = l && c.right = r
}