import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ExternalLink, FileText, Users, Shield, Briefcase, ArrowLeft, TrendingUp } from 'lucide-react';

export default function About() {
  return (
    <>
      <Helmet>
        <title>About Catallax - Decentralized Gig Work</title>
        <meta name="description" content="Learn about the Catallax protocol for pseudonymous contract work on Nostr" />
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="space-y-8">
        {/* Back Button */}
        <Button variant="outline" asChild>
          <Link to="/catallax">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Link>
        </Button>

        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold">About Catallax</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            An open protocol that enables pseudonymous contract work economies on Nostr
          </p>
        </div>

        {/* Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              How It Works
            </CardTitle>
            <CardDescription>
              Three roles work together to create a decentralized labor market
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center space-y-2">
                <Briefcase className="h-8 w-8 mx-auto text-blue-600" />
                <h3 className="font-semibold">Patrons</h3>
                <p className="text-sm text-muted-foreground">
                  Broadcast paid gigs and fund escrows
                </p>
              </div>
              <div className="text-center space-y-2">
                <Users className="h-8 w-8 mx-auto text-green-600" />
                <h3 className="font-semibold">Free Agents</h3>
                <p className="text-sm text-muted-foreground">
                  Work jobs anonymously and get paid
                </p>
              </div>
              <div className="text-center space-y-2">
                <Shield className="h-8 w-8 mx-auto text-purple-600" />
                <h3 className="font-semibold">Arbiters</h3>
                <p className="text-sm text-muted-foreground">
                  Hold funds in escrow and judge outcomes
                </p>
              </div>
            </div>

            <div className="pt-4 border-t">
              <p className="text-center text-muted-foreground">
                Built on Nostr for censorship resistance and Lightning for instant payments.
                <br />
                <strong>Everyone wins.</strong>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Demo Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Using This Demo</CardTitle>
            <CardDescription>
              This is a demonstration client for the Catallax protocol
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <p><strong>1. Connect:</strong> Log in with your Nostr account or create one</p>
              <p><strong>2. Explore:</strong> Browse available tasks and arbiters in the Discover tab</p>
              <p><strong>3. Participate:</strong> Create tasks as a patron, apply as a worker, or offer arbiter services</p>
              <p><strong>4. Transact:</strong> Use Lightning payments (demo mode available) for escrow and payouts</p>
            </div>
            <div className="mt-4 p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Note:</strong> This is experimental software. The protocol is still in development.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Tips for Successful Testing */}
        <Card>
          <CardHeader>
            <CardTitle>Tips for a Successful Test</CardTitle>
            <CardDescription>
              Guidelines for each role to ensure smooth testing experience
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Patron Section */}
            <div>
              <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-blue-600" />
                As a Patron / Task Creator
              </h3>
              <div className="space-y-3 text-sm">
                <p>Click the "Create Task" button.</p>
                <p>If you expect your task to actually be "worked" by someone, be sure to make it viable. Have a clear deliverable and a reasonable price (probably quite low, since we're playing around here).</p>
                <p>Choose the arbiter with the lowest fee - probably that flat-rate 100 sats one for now.</p>
                <p>Go to "Settings" and flip the toggle so that you're in live payments mode.</p>
                <p>Once you've created your task, make sure to fund it! Find your new task in your Dashboard and either "Manage" or "Fund Escrow". This lightning payment will go to the Arbiter you've chosen.</p>
                <p>The payments are currently a bit wonky. You probably want to click "Pay & Auto-detect" before you make the lightning payment. If that fails, you can use the "I paid, continue" button.</p>
                <p>Once you see your task as "funded" in the Dashboard, it's time to either wait for someone to contact you or to go out looking for a worker.</p>
                <p>When you and a worker agree, you'll want to add them as the assigned worker on the task. At the moment, you have to add their key as hex (sorry). You can use <a href="https://nwak.nostr.technology" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">nak</a> to get their public key hex: paste their npub and look for "public key hex" on the left. I'll fix this soon to allow npubs directly. Add them and click "Assign" and the task should transition to "in progress".</p>
                <p>Once the worker submits their task as completed, the Arbiter will review (and probably contact you to discuss). If all goes well, the payment will be released to the worker and the task will be marked as concluded by the Arbiter. If the work isn't acceptable, the Arbiter will refund you the amount held in escrow (less their fee, probably).</p>
              </div>
            </div>

            <Separator />

            {/* Free Agent Section */}
            <div>
              <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                <Users className="h-5 w-5 text-green-600" />
                As a Free Agent / Task Worker
              </h3>
              <div className="space-y-3 text-sm">
                <p>Check out the "Discover" tab and look for tasks that are in the "funded" state. This means that the Patron has funded the escrow and the money is held in trust, waiting for someone to do the job correctly.</p>
                <p><strong>If you want to be assured you'll get paid, make sure you're accepted as the worker first!</strong> There's nothing stopping you from just fulfilling the task, but the norm here is that you will get in touch with the Patron and they will select you to do the work. Once they assign you to the task, you have more certainty that you'll be paid by the Arbiter.</p>
                <p>Do the job, come back to the task and click "Manage": here you'll find a "Mark work as submitted" button. Click that, and the task will progress to "submitted".</p>
                <p>Depending on the task, you probably also need to talk to the Arbiter and Patron to confirm things. This happens out of band.</p>
                <p>Now you wait for the Arbiter to judge your work and release payment to you.</p>
              </div>
            </div>

            <Separator />

            {/* Arbiter Section */}
            <div>
              <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                <Shield className="h-5 w-5 text-purple-600" />
                As an Arbiter / Escrow Holder
              </h3>
              <div className="space-y-3 text-sm">
                <p>Use the "Create Arbiter Service" button. Fill out the form. Since we're testing here, you probably want to choose a very low "flat fee" or a small percentage.</p>
                <p>Once you've published your service, wait around or go advertise yourself. If you've read the above, you get an idea of your role.</p>
                <p>Patrons <em>should</em> contact you first before posting a task with you - since if you're not interested you might just ignore their task and the escrow money they send you will basically be a donation. lol, nobody told them to do that.</p>
                <p>Assuming you have consented to take a task, you'll subsequently receive zap payments for escrow amounts, and you should be proactive about reviewing submitted work. Click on "Manage" for a given task to decide to "Pay worker" or "Refund Patron". Like I said, the payments and zap splits are still a bit buggy, but the idea is you should disperse agreed-upon payments and keep whatever fees you were owed.</p>
                <p>Once you complete this payment step, you should be brought to the "Task Conclusion" section where you can report whether the task was done correctly, rejected, etc.</p>
                <p>That's the end of your job. Enjoy your fees.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Grape Rank Section */}
        <Card id="grape-rank">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Grape Rank
            </CardTitle>
            <CardDescription>
              Trust scoring system for Nostr identities
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <p>
                In years past, the author of Catallax had been working on a decentralized, subjective trust protocol in the substrate of a now-defunct "web3" social networking protocol. Aside from a few arcane git repositories, the only artifact from those times is{' '}
                <a
                  href="https://gist.github.com/vcavallo/e008ed60968e9b5c08a9650c712f63bd"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  this gist
                </a>
                , and a lot of scattered nostr notes.
              </p>
            </div>

            <div className="space-y-3">
              <p>
                It turns out{' '}
                <a
                  href="https://njump.me/npub1u5njm6g5h5cpw4wy8xugu62e5s7f6fnysv0sj0z3a8rengt2zqhsxrldq3"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  david "straycat"
                </a>
                {' '}has basically already solved the same problem on Nostr!
              </p>
            </div>

            <div className="space-y-3">
              <p>You can learn more here:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>
                  <a
                    href="https://straycat.brainstorm.social/about.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground"
                  >
                    https://straycat.brainstorm.social/about
                  </a>
                </li>
                <li>
                  <a
                    href="https://straycat.brainstorm.social/about-trusted-assertions.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground"
                  >
                    https://straycat.brainstorm.social/about-trusted-assertions
                  </a>
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <p>But the important bits as it relates to Catallax are as follows:</p>
            </div>

            <div className="space-y-3">
              <p>
                Trust and Reputation are subjective: My opinion of npubX might be very different than your opinion of npubX. Consequentially, the networks of individuals with whom we each want to interact or do business may be divergent. Our experience with networked software should be similarly subjective and personalized. Centralized parties cannot provide this level of personalization.
              </p>
            </div>

            <div className="space-y-3">
              <p>
                As it stands now, the "reputation" that GrapeRank and VerifiedFollows provide is built off of basic nostr primitives: Following, Muting, Reporting, etc. In the future, specialized non-social clients (like Catallax, marketplaces, games, etc.) will be able to supply the raw materials to crunch and yield reputation scores. <strong>That means</strong> that your history and interactions <em>on Catallax</em> will inform your <em>Catallax reputation</em>. This can be <strong>different</strong> than your reputation on social clients. Maybe you are extremely trustworthy with regard to freelance software development, but you are a rampant shitposter and flamewar-starter - people block and mute you on nostr socials, but that doesn't mean its not a joy to work with you on software projects. One size <em>cannot</em> fit all, and shouldn't. Networked society simply cannot succeed until we separate these concerns.
              </p>
            </div>

            <div className="space-y-3">
              <p>
                At the moment, as Brainstorm and{' '}
                <a
                  href="https://github.com/nostr-protocol/nips/pull/1534"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  NIP-85
                </a>
                {' '}are built out, there are two demo "Points of View" for the GrapeRank and VerifiedFollows: A sample "Catallax 'global' "{' '}
                <a
                  href="https://njump.me/npub1qwe3auavzmlfzkul67j02atcntgd8hwynvj2794zjmuuly6czcds69qldl"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  npub
                </a>
                , and the "Pretty Good Freedom Tech"{' '}
                <a
                  href="https://njump.me/npub120dtguu42s45m7wf6kejjdzq8d637z5g9e5mhrwc5esd7w547qks8sf6jp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  npub
                </a>
                . One day, you'll be able to use <em>your own</em> POV, or that of a friend or other trusted party. <strong>Note:</strong> A client app providing <em>its own</em> Grapevine as a "global opinion" is a double-edged sword. It could be a value-add if they have taken the time to carefully curate the individuals whom it considers to be trustworthy. Or it could become another centralizing "Credit Agency" (in the bad way). But since we're swimming in the warm waters of open protocols and Exit, you'll always be able to simply ignore the "central/global" opinions and splinter off on your own network.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <ExternalLink className="h-5 w-5" />
                  <h3 className="font-semibold">Learn More</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Visit the main Catallax website for detailed documentation, principles, and roadmap.
                </p>
                <Button asChild className="w-full">
                  <a
                    href="https://catallax.network"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Learn more about Catallax here
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  <h3 className="font-semibold">Technical Specification</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Read the draft Nostr Improvement Proposal (NIP) that defines the Catallax protocol.
                </p>
                <Button variant="outline" asChild className="w-full">
                  <a
                    href="https://github.com/nostr-protocol/nips/pull/1714"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View Draft NIP
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground pt-8 border-t">
          <p>
            Catallax is a protocol, not a platform. This demo client is built to showcase the possibilities.
          </p>
          <p className="mt-2">
            by{' '}
            <a
              href="https://njump.me/npub19ma2w9dmk3kat0nt0k5dwuqzvmg3va9ezwup0zkakhpwv0vcwvcsg8axkl"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              vinney
            </a>
            {' '}• Vibed with{' '}
            <a
              href="https://soapbox.pub/mkstack"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              MKStack
            </a>
          </p>
        </div>
      </div>
    </div>
    </>
  );
}
