# Data Terms of Use : giving people new kinds of control over their data 
#### status: first draft (10 April 2017)
#### by electronic Max ~ emax@cs.ox.ac.uk, Reuben Binns ~ reuben.binns@cs.ox.ac.uk, Jun Zhao ~ jun.zhao@cs.ox.ac.uk, and Nigel Shadbolt ~ nigel.shadbolt@cs.ox.ac.uk

This document describes Data Terms of Use, an experimental idea in designed to give end-users control of data.

This repository represents draft ideas on the DTOU as a specification, and may ultimately serve as a normative set of specs. However at this point it is intended to serve as a public facing RfC and open community collaborative artefact.  If you wish to contribute, feel free to fork and make pull requests, or simply subnit an issue up above. 

## Overview: DToU vs the Platform Web

The core idea of DTOU is to allow people to exprss preferences over how others see and interact with data artefacts they find "in the wild". 

For example, imagine if someone has shared a selfie with you.  How do you know what they want you to do with it? 

Do they want to know that you've looked at it?  Do they want feedback on whether you like or hate it?  Do you want them to keep it or to destroy it after they've looked at it? Would they mind it if you showed it to your best friend? What about their mother?

Today, such semantics are fixed within the platforms that we used to send and control our data.  For example, Snapchat automatically keeps track of when the receipient of your snap opens and views it, and allows you to specify exactly how long they have to look at it before it is automatically destroyed.  

Similarly, people know how to interact with tweets on Twitter because there are a fixed set of things the Twitter interface lets you do to interact with another person's tweet.  Namely, you can retweet, like, or reply to it.  And that's about it.

### What if there were another way?

What if the ability to interact with data were not dictated by platforms themselves, but were flexible, fluid and most of all, defined by end-users?

This seems both challenging and nebulous.  Why might people want to control their data, anyway? We have at least three reasons.

#### 1. By making violations easier to identify

If people could declare explicitly how they want their data managed and used, then it is clearer when services act in violation of their wishes.  

Helen Nissenbaum coined the term [contextual integrity](https://crypto.stanford.edu/portia/papers/RevnissenbaumDTP31.pdf) to refer to the idea that people have highly context-specific epxectations about how they intend to have their data consumed, used, and managed, and when these expectations are violated, they often result in what we see a violation of an implicit social contract, such as an intrusion of our privacy.

#### 2. To grant platform autonomy

By externalising expectations into a language that can be read by anyone (both humans and machines), it empowers people to then understand what people expect of their data, and to choose to either honour or violate these expectations, regardless of where the data lie.

This reduces dependence on platforms to comply with people's wishes; people can instead choose the platform (or service) that respects their wishes.

#### 3. To unlock innovation through experimentation

Mega social platforms today (like [Facebook](https://facebook.com) or [Twitter](https://twitter.com) suffer from such widespread success that it undermines their ability to innovate.  In order to provide a uniform interface across all users, such platforms are faced with an all-or-nothing choice; to roll out a new feature to everyone, and [face](http://www.telegraph.co.uk/technology/facebook/6442644/Facebook-users-angry-at-changes-to-sites-home-page.html) [the risk](http://www.independent.co.uk/life-style/gadgets-and-tech/news/angry-facebook-users-revolting-over-changes-1810144.html) [of widespread backlash](https://www.theguardian.com/technology/2013/dec/13/twitter-reinstates-blocking-function-after-backlash), or to keep the status quo.  

This result of this phenomenon is feature inertia and eventual stagnation; the least risky action for such platforms is to not change anything, or to change things as little as possible to avoid upsetting users.  As a result, new features are rolled out glacially slowly, if at all, instead of allowing different individuals (who have different needs) to have their own interfaces and capabilities.

Finally, thanks to the market dominance of today's social platforms, there is extremely little diversity in the ecosystem - what has resulted from this process is a calcification of the channels that we used to communicate everyday, an artificial coagulation and sparcity of choice within the malleable, versatile digital substrates that we technology has given for us.

### The DToU Approach: An Experiment in Shape their Own Interactions

DToU represents not a single technology but an experiment seeking to evaluate an approach at giving people the ability to articulate the interactions around and with their information.

## Acknowledgements
This is a project that started under the [EPSRC Project SOCIAM: The Theory and Practice of Social Machines](http://sociam.org).
