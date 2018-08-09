open util/boolean
open util/ternary
open util/sequniv   // Required for sequences

abstract sig SymbVal {}
sig Snap extends SymbVal {}
one sig Unit extends Snap {}


abstract sig Combine extends Snap {
    left: one SymbVal,
    right: one SymbVal
}
fun combine [ l, r: Snap ]: Snap {
    { c: Combine | c.left = l && c.right = r }
}