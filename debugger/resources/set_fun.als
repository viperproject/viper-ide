abstract sig Set {
	elems: set univ
}

pred empty_set [ s': Set ] {
	no s'.elems
}

pred set_singleton [ e: univ, s': Set ] {
	s'.elems = e
	one e
}
pred set_add [ s1: Set, e: univ, s': Set ] {
	s'.elems = s1.elems + e
	one e
}
fun set_cardinality [ s1: Set ]: one Int {
	#(s1.elems)
}
pred set_difference [ s1, s2, s': Set ] {
	s'.elems = s1.elems - s2.elems
}
pred set_intersection [ s1, s2, s': Set ] {
	s'.elems = s1.elems & s2.elems
}
pred set_union [ s1, s2, s': Set ] {
	s'.elems = s1.elems + s2.elems
}
pred set_in [ e: univ, s1: Set ] {
	e in s1.elems
	one e
	some s1.elems
}
pred set_subset [ s1, s2: Set ] {
	s1.elems in s2.elems
}
pred set_disjoint [ s1, s2: Set ] {
	disjoint[s1.elems, s2.elems]
}
pred set_equals [ s1, s2: Set ] {
	s1.elems = s2.elems
}