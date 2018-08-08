abstract sig Set {
	elems: set univ
}

lone sig EmptySet in Set {} { elems = none }

one sig SetFun {
	singleton: univ -> lone Set,
	add: (Set -> univ) -> lone Set,	
	cardinality: Set -> lone Int,
	difference: (Set -> Set) -> lone Set,
	intersection: (Set -> Set) -> lone Set,
	union: (Set -> Set) -> lone Set,
	-- setIn: Set -> univ,
	-- subset: Set -> Set,
	-- setDisjoint: Set -> Set
	setIn: (Set -> univ) -> lone Bool,
	subset: (Set -> Set) -> lone Bool,
	setDisjoint: (Set -> Set) -> lone Bool
}

fact set_singleton_definition {
	all e: univ, s: Set | SetFun.singleton[e] = s <=> s.elems = e
}

fact set_add_definition {
	all s, s': Set, e: univ | SetFun.add[s, e] = s' <=> (s'.elems = s.elems + e)
}

fact { all s: Set, i: Int | SetFun.cardinality[s] = i <=> i = #(s.elems) }
fact { all s1, s2, s': Set | SetFun.difference[s1, s2] = s' <=> s'.elems = s1.elems - s2.elems }
fact { all s1, s2, s': Set | SetFun.intersection[s1, s2] = s' <=> s'.elems = s1.elems & s2.elems }
fact { all s1, s2, s': Set | (SetFun.union[s1, s2] = s' <=> s'.elems = s1.elems + s2.elems) }
-- fact { all s: Set, e: univ | (s -> e) in SetFun.setIn <=> e in s.elems }
-- fact { all s1, s2: Set | (s1 -> s2) in SetFun.subset <=> (s1.elems in s2.elems) }
-- fact { all s1, s2: Set | (s1 -> s2) in SetFun.setDisjoint <=> disjoint[s1.elems, s2.elems] }
fact { all s: Set, e: univ, b: Bool | SetFun.setIn[s, e] = b => (e in s.elems => b = True else b = False) }
fact { all s1, s2: Set, b: Bool | SetFun.subset[s1, s2] = b <=> (s1.elems in s2.elems => b = True else b = False) }
fact { all s1, s2: Set, b: Bool | SetFun.setDisjoint[s1, s2] = b <=> (disjoint[s1.elems, s2.elems] => b = True else b = False) }
