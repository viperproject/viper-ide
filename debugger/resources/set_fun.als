abstract sig Set {
	set_elems: set univ
}

pred empty_set [ s': Set ] {
	no s'.set_elems
}

pred set_singleton [ e: univ, s': Set ] {
	s'.set_elems = e
	one e
}
pred set_add [ s1: Set, e: univ, s': Set ] {
	s'.set_elems = s1.set_elems + e
	one e
}
fun set_cardinality [ s1: Set ]: one Int {
	#(s1.set_elems)
}
pred set_difference [ s1, s2, s': Set ] {
	s'.set_elems = s1.set_elems - s2.set_elems
}
pred set_intersection [ s1, s2, s': Set ] {
	s'.set_elems = s1.set_elems & s2.set_elems
}
pred set_union [ s1, s2, s': Set ] {
	s'.set_elems = s1.set_elems + s2.set_elems
}
pred set_in [ e: univ, s1: Set ] {
	e in s1.set_elems
	one e
	some s1.set_elems
}
pred set_subset [ s1, s2: Set ] {
	s1.set_elems in s2.set_elems
}
pred set_disjoint [ s1, s2: Set ] {
	disjoint[s1.set_elems, s2.set_elems]
}
pred set_equals [ s1, s2: Set ] {
	s1.set_elems = s2.set_elems
}