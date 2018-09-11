open util/boolean
open util/ternary
open util/integer
open util/relation

abstract sig Snap {}
one sig Unit extends Snap {}

abstract sig SortWrapper extends Snap {
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
    c.left != c && c.right != c
    c not in c.^left
	c not in c.^right
}

abstract sig CustomInt {
    value: one Int
}

fact { all i1, i2: CustomInt | i1 = i2 <=> i1.value = i2.value }