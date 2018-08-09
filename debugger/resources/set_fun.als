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
fun set_cardinality [ s1: Set ]: one Int {
	#(s1.elems)
}
fun set_difference [ s1, s2: Set ]: one Set {
	{ s': Set | s'.elems = s1.elems - s2.elems }
}
fun set_intersection [ s1, s2: Set ]: one Set {
	{ s': Set | s'.elems = s1.elems & s2.elems }
}
fun set_union [ s1, s2: Set ]: one Set {
	{ s': Set | s'.elems = s1.elems + s2.elems }
}
fun set_in [ s1: Set, e: univ ]: one Bool {
	e in s1.elems => True else False
}
fun set_subset [ s1, s2: Set ]: one Bool {
	s1.elems in s2.elems => True else False
}
fun set_disjoint [ s1, s2: Set ]: one Bool {
	disjoint[s1.elems, s2.elems] => True else False
}