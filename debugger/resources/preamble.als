open util/boolean
open util/ternary

sig Snap {}
one sig Unit extends Snap {}


abstract sig Combine extends Snap {
    left: one Snap,
    right: one Snap
}

pred combine [ l, r: Snap, c: Combine ] {
    c.left = l && c.right = r
}