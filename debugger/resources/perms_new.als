abstract sig Perm {} 
one sig W in Perm {}
one sig Z in Perm {}
one sig PermRelations {
	eq: Perm -> Perm, 
	lessthan: Perm -> Perm,
	add: Perm -> Perm -> lone Perm,
	new: Int -> Int -> lone Perm
} {
	all a:Perm | perm_equals[a, a]
}
fact TransitiveLT {
	all a, b, c: Perm | perm_less[a, b] and perm_less[b, c] implies perm_less[a, c]
}
fact TransitiveEQ {
	all a, b, c: Perm | perm_equals[a, b] and perm_equals[b, c] implies perm_equals[a, c]
}
fact CommutativeEQ {
	all a, b: Perm | perm_equals[a, b] implies perm_equals[b, a]
}
fact { all a1, b1, a2, b2: Perm |
			( one PermRelations.add[a1, b1] and
			  one PermRelations.add[a2, b2] and
			  perm_equals[b1, b2] and
			  perm_equals[a1, a2] )
			=> perm_equals[PermRelations.add[a1, b1], PermRelations.add[a2, b2]] }
fact { perm_less[Z, W] }
fact { all p, p': Perm | perm_plus[ p, Z, p' ] => perm_equals[ p', p ] }
fact { all p, p': Perm | perm_plus[ Z, p, p' ] => perm_equals[ p', p ] }
pred perm_new[ n, d: Int, p': Perm ] {
	one PermRelations.new[n, d]
	p' = PermRelations.new[n, d]
	(n > d) => (perm_less[W, p'] and perm_less[Z, p'])
	(n = d) => (perm_equals[p', W])
	(n < d and n > 0) => (perm_less[p', W] and perm_less[Z, p'])
	(n = 0) => (perm_equals[p', Z])
}
pred perm_less[ p1, p2: Perm ] {
	one p1 and one p2
    ((p1 -> p2) in PermRelations.lessthan) and not perm_equals[p1, p2]
}
pred perm_at_most[ p1, p2: Perm ] {
	one p1 and one p2
    perm_less[p1, p2] or perm_equals[p1, p2]
}
pred perm_at_least[ p1, p2: Perm ] {
	one p1 and one p2
    perm_at_most[p2, p1]
}
pred perm_greater[ p1, p2: Perm ] {
	one p1 and one p2
    perm_less[p2, p1]
}
pred perm_plus[ p1, p2, p': Perm ] {
	one p1 and one p2 and one p'
	(perm_equals[p1, Z] iff perm_equals[p2, p'])
	(perm_equals[p2, Z] iff perm_equals[p1, p'])
	(perm_less[Z, p1] and perm_less[Z, p2] iff (
		perm_less[p1, p'] and perm_less[p2, p']
	))
	(p1 -> p2 -> p') in PermRelations.add
	(p2 -> p1 -> p') in PermRelations.add
	(perm_less[Z, p'] implies (perm_less[Z, p1] or perm_less[Z, p2]))
	(perm_less[Z, p2] implies perm_less[Z, p'])
	(perm_less[Z, p1] implies perm_less[Z, p'])
	(perm_less[Z, p1] iff perm_less[p2, p'])
	(perm_less[Z, p2] iff perm_less[p1, p'])
}
pred perm_minus[ p1, p2, p': Perm ] {
	one p1 and one p2 and one p'
	(perm_equals[p2, Z] iff perm_equals[p', p1])
	(perm_equals[p2, p1] iff perm_equals[p', Z])
	(perm_less[p2, p1] iff perm_less[Z, p'])
	(perm_less[Z, p2] iff perm_less[p', p1])
	perm_plus[ p', p2, p1 ]
	perm_plus[ p2, p', p1 ]
}
pred int_perm_div[ p: Perm, d: Int, p': Perm ] {
}
pred perm_mul[ p1, p2, p': Perm ] {
}
pred int_perm_mul[ i: Int, p, p': Perm ] {
}
pred perm_min[ p1, p2, p': Perm ] {
  one p1 and one p2 and one p'
  perm_less[p1, p2]
    => perm_equals[p1, p']
    else perm_equals[p2, p']
}
pred perm_equals [ p1, p2: Perm ] {
	one p1 and one p2
	(p1 -> p2) in PermRelations.eq
	(p2 -> p1) in PermRelations.eq
}