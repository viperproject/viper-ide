

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

pred perm_new[ n, d: Int, p': Perm ] {
    p'.num = n
    p'.denom = d
}

pred perm_less[ p1, p2: Perm ] {
  mul[p1.num, p2.denom] < mul[p2.num, p1.denom]
}

pred perm_at_most[ p1, p2: Perm ] {
  mul[p1.num, p2.denom] <= mul[p2.num, p1.denom]
}

pred perm_at_least[ p1, p2: Perm ] {
  mul[p1.num, p2.denom] >= mul[p2.num, p1.denom]
}

pred perm_greater[ p1, p2: Perm ] {
  mul[p1.num, p2.denom] > mul[p2.num, p1.denom]
}

pred perm_plus[ p1, p2, p': Perm ] {
  (p1.denom = p2.denom)
    =>
        (p'.num = plus[p1.num, p2.num] &&
         p'.denom = p1.denom)
    else
        (p'.num = plus[mul[p1.num, p2.denom], mul[p2.num, p1.denom]] &&
         p'.denom = mul[p1.denom, p2.denom])
}


pred perm_minus[ p1, p2, p': Perm ] {
	perm_equals[ p1, p2 ]
		=> p' = Z
		else (
      p1.denom = p2.denom
        => (
          p'.num = minus[p1.num, p2.num] and
          p'.denom = p1.denom
        ) else (
          p'.num = minus[mul[p1.num, p2.denom], mul[p2.num, p1.denom]] and
          p'.denom = mul[p1.denom, p2.denom]
        )
		)
}

pred int_perm_div[ p: Perm, d: Int, p': Perm ] {
  p'.num = p.num
  p'.denom = mul[p.denom, d]
}

pred perm_mul[ p1, p2, p': Perm ] {
  p'.num = mul[p1.num, p2.num]
  p'.denom = mul[p1.denom, p2.denom]
}

pred int_perm_mul[ i: Int, p, p': Perm ] {
  p'.num = mul[p.num, i]
  p'.denom = p.denom
}

pred perm_min[ p1, p2, p': Perm ] {
  mul[p1.num, p2.denom] < mul[p2.num, p1.denom]
    => (p' = p1)
    else (p' = p2)
}

pred perm_equals [ p1, p2: Perm ] {
	// p1 = p2
  // The additional two clauses create problems with quantified permissions
  (p1.num = p2.num && p1.denom = p2.denom)
  || (mul[p1.num, p2.denom] = mul[p1.denom, p2.num])
}