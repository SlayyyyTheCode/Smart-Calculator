import { describe, expect, it } from "vitest";

import { ageOn, cpfContribution, OW_CEILING } from "@/lib/domain/cpf";

/**
 * Figures checked against the CPF Board's own tables (from 1 January 2026),
 * not against this implementation. Where the table states a maximum
 * contribution, that maximum is the assertion — it is the Board's arithmetic
 * rather than a restatement of ours.
 */

const sgd = (dollars: number) => Math.round(dollars * 100);

/**
 * Every figure below the 2027 block is from the table in force in 2026, so the
 * date is pinned rather than left to today. Without it these tests would start
 * failing on 1 January 2027 — not because anything broke, but because they were
 * silently asking a different question.
 */
const IN_2026 = "2026-08-15";
const IN_2027 = "2027-03-04";

describe("employee CPF, citizens and 3rd-year PRs", () => {
  it("takes 20% at 55 and below", () => {
    const result = cpfContribution({ grossMonthly: sgd(5000), age: 30, residency: "citizen_or_pr3", onDate: IN_2026 });
    expect(result.employeeContribution).toBe(sgd(1000));
    expect(result.takeHome).toBe(sgd(4000));
  });

  it("hits the table's stated maximum of $1,600 at the ceiling", () => {
    // Table 1: employee 20% of OW, "Max. of $1,600" — and 0.20 x 8000 = 1600.
    const result = cpfContribution({ grossMonthly: OW_CEILING, age: 40, residency: "citizen_or_pr3", onDate: IN_2026 });
    expect(result.employeeContribution).toBe(sgd(1600));
    expect(result.cappedByCeiling).toBe(false);
  });

  it("does not go past the maximum however large the salary", () => {
    const result = cpfContribution({ grossMonthly: sgd(25000), age: 40, residency: "citizen_or_pr3", onDate: IN_2026 });
    expect(result.employeeContribution).toBe(sgd(1600));
    expect(result.takeHome).toBe(sgd(23400));
    expect(result.cappedByCeiling).toBe(true);
  });

  it("steps down through every age band", () => {
    const at = (age: number) =>
      cpfContribution({ grossMonthly: sgd(6000), age, residency: "citizen_or_pr3", onDate: IN_2026 }).employeeContribution;
    expect(at(55)).toBe(sgd(1200)); // 20%
    expect(at(56)).toBe(sgd(1080)); // 18%
    expect(at(60)).toBe(sgd(1080)); // still 18% at exactly 60
    expect(at(61)).toBe(sgd(750)); // 12.5%
    expect(at(66)).toBe(sgd(450)); // 7.5%
    expect(at(71)).toBe(sgd(300)); // 5%
  });

  it("puts the band boundary on the older side of the birthday", () => {
    // "55 and below" then "above 55 to 60": exactly 55 is still the first band.
    const fiftyFive = cpfContribution({ grossMonthly: sgd(4000), age: 55, residency: "citizen_or_pr3", onDate: IN_2026 });
    const fiftySix = cpfContribution({ grossMonthly: sgd(4000), age: 56, residency: "citizen_or_pr3", onDate: IN_2026 });
    expect(fiftyFive.band).toBe("55 and below");
    expect(fiftySix.band).toBe("above 55 to 60");
  });
});

describe("the low wage bands", () => {
  it("takes nothing at $50 or less", () => {
    expect(
      cpfContribution({ grossMonthly: sgd(50), age: 30, residency: "citizen_or_pr3", onDate: IN_2026 }).employeeContribution,
    ).toBe(0);
  });

  it("takes nothing from the employee between $50 and $500", () => {
    // The employer contributes 17% here; the employee's share is nil, so
    // take-home is the whole wage.
    const result = cpfContribution({ grossMonthly: sgd(400), age: 30, residency: "citizen_or_pr3", onDate: IN_2026 });
    expect(result.employeeContribution).toBe(0);
    expect(result.takeHome).toBe(sgd(400));
  });

  it("phases in between $500 and $750 using the table's coefficient", () => {
    // Table 1, 55 and below: employee share is 0.6 x (TW - $500).
    // At $700 that is 0.6 x 200 = $120.
    const result = cpfContribution({ grossMonthly: sgd(700), age: 30, residency: "citizen_or_pr3", onDate: IN_2026 });
    expect(result.employeeContribution).toBe(sgd(120));
  });

  it("uses a different coefficient for an older worker in the same band", () => {
    // 0.225 x (700 - 500) = $45 for the above-65-to-70 band.
    const result = cpfContribution({ grossMonthly: sgd(700), age: 67, residency: "citizen_or_pr3", onDate: IN_2026 });
    expect(result.employeeContribution).toBe(sgd(45));
  });

  it("crosses from phase-in to full rate without a jump backwards", () => {
    const at750 = cpfContribution({ grossMonthly: sgd(750), age: 30, residency: "citizen_or_pr3", onDate: IN_2026 });
    const at751 = cpfContribution({ grossMonthly: sgd(751), age: 30, residency: "citizen_or_pr3", onDate: IN_2026 });
    expect(at750.employeeContribution).toBe(sgd(150)); // 0.6 x 250
    expect(at751.employeeContribution).toBe(sgd(150)); // 20% of 751 = 150.20, floored
    expect(at751.employeeContribution).toBeGreaterThanOrEqual(at750.employeeContribution);
  });
});

describe("permanent residents", () => {
  it("charges a 1st-year PR 5% at every age", () => {
    // Table 2: employee 5%, "Max. of $400" in every band.
    for (const age of [30, 57, 62, 70]) {
      const result = cpfContribution({ grossMonthly: sgd(5000), age, residency: "pr_year1", onDate: IN_2026 });
      expect(result.employeeContribution).toBe(sgd(250));
    }
    expect(
      cpfContribution({ grossMonthly: OW_CEILING, age: 30, residency: "pr_year1", onDate: IN_2026 }).employeeContribution,
    ).toBe(sgd(400));
  });

  it("charges a 2nd-year PR 15% under 55, reaching the table's $1,200 maximum", () => {
    const result = cpfContribution({ grossMonthly: OW_CEILING, age: 30, residency: "pr_year2", onDate: IN_2026 });
    expect(result.employeeContribution).toBe(sgd(1200));
  });

  it("steps a 2nd-year PR down by age", () => {
    const at = (age: number) =>
      cpfContribution({ grossMonthly: sgd(4000), age, residency: "pr_year2", onDate: IN_2026 }).employeeContribution;
    expect(at(30)).toBe(sgd(600)); // 15%
    expect(at(58)).toBe(sgd(500)); // 12.5%
    expect(at(63)).toBe(sgd(300)); // 7.5%
    expect(at(70)).toBe(sgd(200)); // 5%
  });

  it("has no 65-to-70 split, unlike the citizen table", () => {
    // Table 2 and 3 stop at "above 65"; Table 1 splits 65–70 and above 70.
    const pr = cpfContribution({ grossMonthly: sgd(4000), age: 67, residency: "pr_year2", onDate: IN_2026 });
    const citizen = cpfContribution({ grossMonthly: sgd(4000), age: 67, residency: "citizen_or_pr3", onDate: IN_2026 });
    expect(pr.band).toBe("above 65");
    expect(citizen.band).toBe("above 65 to 70");
  });

  it("takes nothing when CPF does not apply", () => {
    const result = cpfContribution({ grossMonthly: sgd(9000), age: 30, residency: "none", onDate: IN_2026 });
    expect(result.employeeContribution).toBe(0);
    expect(result.takeHome).toBe(sgd(9000));
  });
});

describe("rounding", () => {
  it("rounds the employee's share down to whole dollars", () => {
    // 20% of $5,555.55 is $1,111.11, which the Board rounds down to $1,111.
    const result = cpfContribution({ grossMonthly: sgd(5555.55), age: 30, residency: "citizen_or_pr3", onDate: IN_2026 });
    expect(result.employeeContribution).toBe(sgd(1111));
  });

  it("never leaves a fraction of a dollar in the contribution", () => {
    for (const gross of [1234.56, 3333.33, 4999.99, 6789.01, 751.49]) {
      const { employeeContribution } = cpfContribution({
        grossMonthly: sgd(gross),
        age: 35,
        residency: "citizen_or_pr3", onDate: IN_2026,
      });
      expect(employeeContribution % 100).toBe(0);
    }
  });

  it("keeps gross exactly equal to take-home plus the contribution", () => {
    // The invariant a payslip has to satisfy. Floating point in the middle of
    // this would show up here.
    for (const gross of [1234.56, 700.01, 8000, 12345.67, 499.99]) {
      const minor = sgd(gross);
      const { employeeContribution, takeHome } = cpfContribution({
        grossMonthly: minor,
        age: 42,
        residency: "citizen_or_pr3", onDate: IN_2026,
      });
      expect(takeHome + employeeContribution).toBe(minor);
    }
  });
});

describe("ageOn", () => {
  it("counts completed years", () => {
    expect(ageOn("1990-08-15", "2026-08-15")).toBe(36);
    expect(ageOn("1990-08-16", "2026-08-15")).toBe(35);
    expect(ageOn("1990-12-31", "2026-08-15")).toBe(35);
    expect(ageOn("1990-01-01", "2026-08-15")).toBe(36);
  });

  it("does not shift a birthday across a day boundary", () => {
    // A Date in local time is what makes this go wrong; these are strings.
    expect(ageOn("2001-01-01", "2026-01-01")).toBe(25);
    expect(ageOn("2001-01-02", "2026-01-01")).toBe(24);
  });
});

describe("the 2027 schedule takes over by itself", () => {
  it("raises the above-55-to-60 band from 18% to 19%", () => {
    const before = cpfContribution({ grossMonthly: sgd(6000), age: 58, residency: "citizen_or_pr3", onDate: "2026-12-31" });
    const after = cpfContribution({ grossMonthly: sgd(6000), age: 58, residency: "citizen_or_pr3", onDate: "2027-01-01" });
    expect(before.employeeContribution).toBe(sgd(1080)); // 18%
    expect(after.employeeContribution).toBe(sgd(1140)); // 19%
  });

  it("raises the above-60-to-65 band from 12.5% to 13%", () => {
    const before = cpfContribution({ grossMonthly: sgd(4000), age: 63, residency: "citizen_or_pr3", onDate: "2026-12-31" });
    const after = cpfContribution({ grossMonthly: sgd(4000), age: 63, residency: "citizen_or_pr3", onDate: "2027-01-01" });
    expect(before.employeeContribution).toBe(sgd(500));
    expect(after.employeeContribution).toBe(sgd(520));
  });

  it("switches on the first of January and not a day earlier", () => {
    const rate = (onDate: string) =>
      cpfContribution({ grossMonthly: sgd(6000), age: 58, residency: "citizen_or_pr3", onDate })
        .employeeContribution;
    expect(rate("2026-12-31")).toBe(sgd(1080));
    expect(rate("2027-01-01")).toBe(sgd(1140));
    expect(rate("2027-01-02")).toBe(sgd(1140));
  });

  it("leaves every other age band alone", () => {
    for (const [age, expected] of [[30, 1200], [67, 450], [72, 300]] as const) {
      const before = cpfContribution({ grossMonthly: sgd(6000), age, residency: "citizen_or_pr3", onDate: IN_2026 });
      const after = cpfContribution({ grossMonthly: sgd(6000), age, residency: "citizen_or_pr3", onDate: IN_2027 });
      expect(before.employeeContribution).toBe(sgd(expected));
      expect(after.employeeContribution).toBe(sgd(expected));
    }
  });

  it("hits the maximums the 2027 table states", () => {
    // Table 1 from 1 Jan 2027: "Max. of $1,520" at 19%, "Max. of $1,040" at 13%.
    // Both confirm the Ordinary Wage ceiling is still $8,000.
    expect(
      cpfContribution({ grossMonthly: sgd(20000), age: 58, residency: "citizen_or_pr3", onDate: IN_2027 })
        .employeeContribution,
    ).toBe(sgd(1520));
    expect(
      cpfContribution({ grossMonthly: sgd(20000), age: 63, residency: "citizen_or_pr3", onDate: IN_2027 })
        .employeeContribution,
    ).toBe(sgd(1040));
  });

  it("moves the phase-in coefficients with the rates", () => {
    // 0.54 -> 0.57 for 55-60. At $700 that is $108 against $114, and the
    // coefficient is not derivable from the percentage — it is published.
    const before = cpfContribution({ grossMonthly: sgd(700), age: 58, residency: "citizen_or_pr3", onDate: IN_2026 });
    const after = cpfContribution({ grossMonthly: sgd(700), age: 58, residency: "citizen_or_pr3", onDate: IN_2027 });
    expect(before.employeeContribution).toBe(sgd(108));
    expect(after.employeeContribution).toBe(sgd(114));
  });

  it("does not touch the PR tables, which were not changed", () => {
    for (const residency of ["pr_year1", "pr_year2"] as const) {
      for (const age of [30, 58, 63, 70]) {
        expect(
          cpfContribution({ grossMonthly: sgd(5000), age, residency, onDate: IN_2027 }).employeeContribution,
        ).toBe(
          cpfContribution({ grossMonthly: sgd(5000), age, residency, onDate: IN_2026 }).employeeContribution,
        );
      }
    }
  });

  it("names the schedule it used", () => {
    expect(cpfContribution({ grossMonthly: sgd(6000), age: 58, residency: "citizen_or_pr3", onDate: IN_2026 }).schedule)
      .toBe("1 January 2026");
    expect(cpfContribution({ grossMonthly: sgd(6000), age: 58, residency: "citizen_or_pr3", onDate: IN_2027 }).schedule)
      .toBe("1 January 2027");
  });

  it("falls back to the earliest schedule for a date before it", () => {
    // A stated approximation: the app carries no pre-2026 tables, so a
    // back-dated payslip is computed at 2026 rates rather than refused.
    const old = cpfContribution({ grossMonthly: sgd(6000), age: 58, residency: "citizen_or_pr3", onDate: "2019-05-01" });
    expect(old.schedule).toBe("1 January 2026");
    expect(old.employeeContribution).toBe(sgd(1080));
  });
});
