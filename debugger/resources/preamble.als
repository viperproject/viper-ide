open util/boolean
open util/ternary
open util/sequniv   // Required for sequences

sig Snap {}
one sig Unit extends Snap {}


abstract sig Combine extends Snap {
    left: one Snap,
    right: one Snap
}
--fun combine [ l, r: Snap ]: Snap {
--    { c: Combine | c.left = l && c.right = r }
--}
pred combine [ l, r: Snap, c: Combine ] {
    c.left = l && c.right = r
}