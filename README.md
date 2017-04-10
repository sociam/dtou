# Data Terms of Use (DToU): giving people new kinds of control over their data 
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

## The DToU Approach: Enabling End-Users to Control Interactions

DToU represents not a single technology but an experiment seeking to evaluate an approach at giving people the ability to articulate the interactions around and with their information.

### DToU 1.0: Three layers of simplicity

Our proposal of DToU suggests three kinds of sets of concerns around data, dissplayed in this table:

|  _Layer_  |  _Description_ |
| --- | ------- | 
|  1 |  __Uses & Intentions__ | 
|  2 |  __Social Conventions__ |
|  3 |  __Data Handling__ |

We describe each layer in detail below.

#### Layer 1: Uses and Intentions

> The Intentions of Use layer is a way for people to express the desired contexts, purposes and frames of use of particular data, as well as for expressing interpretational, sampling and representational limitations that might affect use, along possibly with accompanying explanations & justifications as to why such constraints or preferences are in place to motivate compliance.

Most people are visible in multiple public or semi-public spaces on the web. We have professional details listed on an institutional web page, we blog and microblog, share videos, have accounts on a semi-public professional and social networks like LinkedIn and Facebook, and contribute on public code repositories like GitHub. While there are various ways to restrict access to such content, it is often more desirable and feasible to allow it to be publicly accessible. However, this can result in content being taken out of context and used to form judgements about us in ways which conflict with our expectations. For instance, public profiles created in a personal capacity might be viewed by a potential employer, who may form an unwarranted judgement about the prospective employee.

Even if we cannot explicitly prevent such outcomes, we may wish to provide additional information which would contextualise our profiles and signal our expectations regarding their uses to honest and well-motivated actors. Many people already attempt to do so in various ways. For instance, many Twitter users indicate in their profile biographies that they are posting in a personal capacity. Some people may use their personal page to link to their presence elsewhere on the web, and provide contextual information about those profiles. Our proposed architecture would enable the communication of such intentions and contexts through machine readable annotations. This would facilitate individuals to signal appropriate uses and relevant contextual information about aspects of their public web presence as it is manifested across multiple platforms. It would also allow for the creation of interfaces to specify these criteria in the absence of established social routines.

Layer 1, or __Uses and Intentions__ of DToU allows differentiation among such uses.

#### Layer 2: Social Conventions



#### Layer 3: Data Handling 



## Acknowledgements
This is a project that started under the [EPSRC Project SOCIAM: The Theory and Practice of Social Machines](http://sociam.org).
