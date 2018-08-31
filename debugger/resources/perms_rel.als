
abstract sig Perm {
    num: one Int,
    denom: one Int
} {
    num >= 0
    denom > 0
    // Silicon does not define this in SMT and defining it here would prevent us
    // from having sums of permissions that exceed W
    // num <= denom
}
one sig W in Perm {} {
    num = 1
    denom = 1
}
one sig Z in Perm {} {
    num = 0
    denom = 1
}

one sig PermRel {
  plus: Perm -> Perm -> lone Perm,
  minus: Perm -> Perm -> lone Perm,
  min: Perm -> Perm -> lone Perm
}

// fun perm_less[ p1, p2: Perm ]: one Bool {
//   (mul[p1.num, p2.denom] < mul[p2.num, p1.denom]) => True else False
// }

// fun perm_at_most[ p1, p2: Perm ]: one Bool {
//   (mul[p1.num, p2.denom] <= mul[p2.num, p1.denom]) => True else False
// }

// fun perm_at_least[ p1, p2: Perm ]: one Bool {
//   (mul[p1.num, p2.denom] >= mul[p2.num, p1.denom]) => True else False
// }

// fun perm_greater[ p1, p2: Perm ]: one Bool {
//   (mul[p1.num, p2.denom] > mul[p2.num, p1.denom]) => True else False
// }

fact { all p1, p2, p': Perm | (p1 -> p2 -> p') in PermRel.plus <=> ((p1.denom = p2.denom) =>
                                                              (p'.num = plus[p1.num, p2.num] &&
                                                                p'.denom = p1.denom)
                                                            else
                                                              (p'.num = plus[mul[p1.num, p2.denom], mul[p2.num, p1.denom]] &&
                                                                p'.denom = mul[p1.denom, p2.denom])) }


fact { all p1, p2, p': Perm | (p1 -> p2 -> p') in PermRel.minus <=> p'.num = minus[mul[p1.num, p2.denom], mul[p2.num, p1.denom]] &&
                                                                    p'.denom = mul[p1.denom, p2.denom] }

// fun int_perm_div[ p: Perm, d: Int ]: one Perm {
//   { p': Perm | p'.num = p.num &&
//                p'.denom = mul[p.denom, d] }
// }

// fun perm_mul[ p1, p2: Perm ]: one Perm {
//   { p': Perm | p'.num = mul[p1.num, p2.num] &&
//                p'.denom = mul[p1.denom, p2.denom] }
// }

// fun int_perm_mul[ i: Int, p: Perm ]: one Perm {
//   { p': Perm | p'.num = mul[p.num, i] &&
//                p'.denom = p.denom }
// }

fact { all p1, p2, p': Perm | (p1 -> p2 -> p') in PermRel.min <=> (mul[p1.num, p2.denom] < mul[p2.num, p1.num] => p1 = p' else p2 = p') }


--fun perm_equals [ p1, p2: Perm ]: one Bool {
--  p1 = p2 => True
--  else (p1.num = p2.num && p1.denom = p2.denom) => True
--  else (mul[p1.num, p2.denom] = mul[p1.denom, p2.num]) => True
--  else False
--}

pred perm_equals [ p1, p2: Perm ] {
	p1 = p2
  // The additional two clauses create problems with quantified permissions
  // || (p1.num = p2.num && p1.denom = p2.denom)
  // || (mul[p1.num, p2.denom] = mul[p1.denom, p2.num])
}