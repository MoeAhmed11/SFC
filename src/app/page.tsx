import Link from "next/link";

// Public landing page. Explains what ConsaPass does for schools and parents,
// then points staff to sign in. The staff app and parent consent flows live
// behind auth / opaque links respectively.
export default function HomePage() {
  return (
    <main>
      <header className="hero">
        <div className="hero__inner">
          <div className="brandmark">
            <span className="brandmark__logo">CP</span>
            ConsaPass
          </div>

          <h1 className="hero__title">Consent and reminders, sorted.</h1>
          <p className="hero__lead">
            ConsaPass helps UK primary schools create activities, collect parental consent
            digitally, and automatically remind parents before deadlines and events — replacing
            paper slips, spreadsheets, and chasing emails.
          </p>

          <div className="toolbar" style={{ justifyContent: "center", marginTop: "2rem" }}>
            <Link href="/login" className="btn btn--primary">
              Staff sign in
            </Link>
            <a href="#how-it-works" className="btn btn--secondary">
              See how it works
            </a>
          </div>

          <p className="muted" style={{ fontSize: "0.85rem", marginTop: "1.5rem" }}>
            Parents don&apos;t need an account — they get a secure link by email when a response is
            needed.
          </p>
        </div>
      </header>

      <section className="section" aria-labelledby="problem-heading">
        <div className="section__inner">
          <h2 id="problem-heading" className="section__heading">
            Consent forms fall through the cracks. ConsaPass catches them.
          </h2>
          <p className="section__subhead">
            Paper slips get lost in bags, spreadsheets get out of date, and staff spend hours
            chasing the same few families. ConsaPass gives every school one place to manage
            consent from start to finish.
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="how-it-works">
        <div className="section__inner">
          <h2 id="how-it-works" className="section__heading">
            How it works
          </h2>
          <ol className="steps">
            <li className="step">
              <span className="step__number">1</span>
              <h3>Create the event</h3>
              <p>
                Staff set up a trip, activity, or event, attach a consent question, and choose the
                classes or year groups it applies to.
              </p>
            </li>
            <li className="step">
              <span className="step__number">2</span>
              <h3>Send secure links</h3>
              <p>
                Each parent or guardian gets a unique, secure link by email — no account or app
                required, and no password to remember.
              </p>
            </li>
            <li className="step">
              <span className="step__number">3</span>
              <h3>Track responses live</h3>
              <p>
                A consent dashboard shows who has responded, who hasn&apos;t, and who has declined,
                updated in real time as replies come in.
              </p>
            </li>
            <li className="step">
              <span className="step__number">4</span>
              <h3>Automatic reminders</h3>
              <p>
                Parents who haven&apos;t responded get reminded before the deadline. Parents who
                have consented get an event reminder beforehand — no manual chasing.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section className="section section--split" aria-labelledby="for-schools-heading">
        <div className="section__inner section__inner--split">
          <div className="card">
            <h2 id="for-schools-heading" className="card__title">
              For schools
            </h2>
            <ul className="check-list">
              <li>Create, edit, cancel, and publish events and consent forms</li>
              <li>Role-based access for admins and event organisers</li>
              <li>Import class rosters and pupil/guardian contacts by CSV</li>
              <li>A live consent status dashboard, per event and per class</li>
              <li>Configurable deadline and event reminders</li>
              <li>Export consent registers and event reports</li>
              <li>Full audit history of consent and notifications</li>
            </ul>
          </div>

          <div className="card">
            <h2 className="card__title">For parents</h2>
            <ul className="check-list">
              <li>No account or app to install — just a secure email link</li>
              <li>Clear, plain-language view of the event and what&apos;s being asked</li>
              <li>Give or decline consent in a couple of taps</li>
              <li>Instant confirmation once a response is submitted</li>
              <li>A friendly reminder if a deadline is coming up</li>
              <li>An event reminder if you&apos;ve already said yes</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="cta-heading">
        <div className="section__inner cta">
          <h2 id="cta-heading" className="section__heading">
            Built for school administration, not admin overhead.
          </h2>
          <p className="section__subhead">
            ConsaPass is currently piloting with schools in the UK. Staff with an account can sign
            in below.
          </p>
          <div className="toolbar" style={{ justifyContent: "center" }}>
            <Link href="/login" className="btn btn--primary">
              Staff sign in
            </Link>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <p className="muted">ConsaPass &mdash; school consent &amp; event reminders, without the paper trail.</p>
      </footer>
    </main>
  );
}
