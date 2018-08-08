abstract sig Set {
	elems: set univ
}

lone sig EmptySet in Set {} { elems = none }

fun set_singleton [ e: univ ]: one Set {
	{ s': Set | s'.elems = e }
}
fun set_add [ s1: Set, e: univ ]: one Set {
	{ s': Set | s'.elems = s1.elems + e }
}
fun set_union [ s1, s2: Set ]: one Set {
	{ s': Set | s'.elems = s1.elems + s2.elems }
}
fun set_cardinality [ s1: Set ]: one Int {
	#(s1.elems)
}