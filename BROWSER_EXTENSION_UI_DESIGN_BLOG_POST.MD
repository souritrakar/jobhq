[Sitemap](https://lab.interface-design.co.uk/sitemap/sitemap.xml)

[Open in app](https://play.google.com/store/apps/details?id=com.medium.reader&referrer=utm_source%3DmobileNavBar&source=post_page---top_nav_layout_nav-----------------------------------------)

Sign up

[Sign in](https://medium.com/m/signin?operation=login&redirect=https%3A%2F%2Flab.interface-design.co.uk%2Fthe-ultimate-guide-to-browser-extensions-design-ea858d6634a6&source=post_page---top_nav_layout_nav-----------------------global_nav------------------)

[Medium Logo](https://medium.com/?source=post_page---top_nav_layout_nav-----------------------------------------)

Get app

[Write](https://medium.com/m/signin?operation=register&redirect=https%3A%2F%2Fmedium.com%2Fnew-story&source=---top_nav_layout_nav-----------------------new_post_topnav------------------)

[Search](https://medium.com/search?source=post_page---top_nav_layout_nav-----------------------------------------)

Sign up

[Sign in](https://medium.com/m/signin?operation=login&redirect=https%3A%2F%2Flab.interface-design.co.uk%2Fthe-ultimate-guide-to-browser-extensions-design-ea858d6634a6&source=post_page---top_nav_layout_nav-----------------------global_nav------------------)

![Unknown user](https://miro.medium.com/v2/resize:fill:64:64/1*dmbNkD5D-u45r44go_cf0g.png)

# The Ultimate Guide to Browser Extensions Design

## Discover the best UX design practices from our in-depth research.

[![Creative Navy](https://miro.medium.com/v2/resize:fill:64:64/2*OmntzLtrZjrL6OHmb7B5fA.png)](https://lab.interface-design.co.uk/?source=post_page---byline--ea858d6634a6---------------------------------------)

[Creative Navy](https://lab.interface-design.co.uk/?source=post_page---byline--ea858d6634a6---------------------------------------)

Follow

12 min read

·

Mar 5, 2024

54

[Listen](https://medium.com/m/signin?actionUrl=https%3A%2F%2Fmedium.com%2Fplans%3Fdimension%3Dpost_audio_button%26postId%3Dea858d6634a6&operation=register&redirect=https%3A%2F%2Flab.interface-design.co.uk%2Fthe-ultimate-guide-to-browser-extensions-design-ea858d6634a6&source=---header_actions--ea858d6634a6---------------------post_audio_button------------------)

Share

**Creative Navy** **has collected some of the best methods and tips based on our experience designing and working with browser extensions and plugins.** This guidance contains the accumulated expertise drawn from our work and additional, thorough research.

**This guide aims to provide a comprehensive view of design patterns and common problems encountered in the UX of browser extensions.**

**The resource is tailored both for novice designers and the experienced ones.**

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/0*1n1pd9anUDouSg9r)

Photo by [Igor Miske](https://unsplash.com/@igormiske?utm_source=medium&utm_medium=referral) on [Unsplash](https://unsplash.com/?utm_source=medium&utm_medium=referral)

## What are browser extensions?

**Browser extensions come as an ingenious way that people have found to level up the appearance, functionality and performance of their browsers.** The beauty of these tools stands in the open-source nature and diversity of extensions and plugins to use. While the browsers’ teams create some extensions, most are done by independent providers. **Anyone who identifies a need or insufficiency that they can fix, and has the appropriate connections to a developer, can upload an extension to the Web Store.** Because of this, we now see a large variety of browser extensions, each with a different look and feel, in categories spanning from “Accessibility” to “Shopping” to “Productivity” and so on.

[**Creative Navy**](https://interface-design.co.uk/) **has benchmarked the most popular browser extensions to pinpoint the common mistakes and design patterns found within these tools.** The article will discuss different types of layouts and common behaviours.

## Shapes & behaviours of browser extensions

**Each browser has a dedicated area in which the user can find their available browser extensions.** In this case, Google Chrome places them next to the link input field — as pictured below.

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*HtcGoWqZIL7ElnhN3-k1iA.png)

Google Chrome —Browser Extensions UX Design

**Some, if not all of the functions of the extension can be accessed from this area by simply clicking on the extension icon.** Once the user clicks this, several ways of interacting with the extension are possible. **One of those ways is through a pop-up modal window.**

## Pop-ups

Pop-ups come in many shapes and sizes — **depending on the complexity of the extension and whether it includes a separate independent page with extra features**. However, certain extensions and plugins can function properly in a smaller window and do not need additional pages.

**According to the consensus on testing drawn up by the Google Chrome Extensions team, pop-ups should generally limit their size to 600x800px.**

**Keep this in mind!** 
The intended **screen resolution needs to be kept in mind** and adjustments should be made accordingly.

**Simple pop-ups:** Many extensions that have simple functions are displayed in a pop-up modal window that overlays the current webpage.

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*Kw8x2NudqzHCoDEJKw-qVg.png)

[Forest](https://www.forestapp.cc/) — Browser Extensions UX Design

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*IT9DtGFNcE_badCnXWH1aQ.png)

[AdBlock](https://getadblock.com/en/) — Browser Extensions UX Design

**The layout in these examples might be basic, with a few key buttons and minimal information being displayed vertically, from top to bottom.** The entire content is usually displayed in a single card, as seen in the Forest extension example.

**The intention behind this design choice is to keep the extension as simple and minimalistic as possible**, while still having all the core functionality available for the user. **Doing this can help avoid an increased cognitive load on the user while navigating the webpage and the modal window simultaneously.**

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*_hIMr4rOdt7la47ugyfFcg.png)

Shazam — Browser Extension UX Design

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*M2ZLgL1tZzE4-jgwbTlt0Q.png)

Shazam — Browser Extension UX Design

In the case of this [**Shazam**](https://www.shazam.com/home) extension, **the pop-up window has an accordion element where the user can view or hide past searched music**. This design does it well, in the way it maintains a compact layout while taking advantage of accordion functions, drop-downs and even side panels (all of which can be completely hidden).

Some pop-ups are triggered automatically, like in the example of the [**Fake News Detector**](https://chromewebstore.google.com/detail/fake-news-detector/ljikbdglbdcmeamlidfjgfjifoclgedc?pli=1) extension. **Every time the user opens a news site or article, the extension automatically runs a verification of the content and returns a score of the content’s factuality.**

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*rCm2xh0B1a87ZoWsOJ1Qsg.png)

Fake News Detector — Browser Extension UX Design

**Disclaimer!**

- **Automatically triggered extensions which display big pop-ups can be frustrating for a lot of users.**

> An obstructive UX will lead to unpleasant experiences.

- **Before deciding to implement such a behaviour, make sure to conduct rigorous user testing to verify how users respond to the actions.**

**Complex Pop-ups:** [**Raindrop.io**](https://raindrop.io/)’s extension is a more complex tool, packing multiple functions to save and manage links, highlights, annotations and tabs.

**A noteworthy feature of this extension is the existence of two possible layouts/appearances,** with **one option being more minimalistic**, and **the second being more complex in terms of functionality.**

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*2Xj2rWl8K4ChT_p4Hk19Gw.png)

Raindrop — Browser Extension UX Design

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*4WB1D6qWJHIt7GF4-VjG1g.png)

Raindrop — Browser Extension UX Design

**The “Mini-app” view of the extension has a different layout from the more simple “Clipper” view.** Here there is a left-hand side panel, with the list of saved elements in a larger container on the right side.

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*JCnxNTSguV5AKIHOXW8K9A.png)

Raindrop — Browser Extension UX Design

[**Todoist**](https://todoist.com/) is another example of a more complex pop-up, having to manage user-created projects, which are made up of multiple tasks. Each task has a number of properties, giving more flexibility to the user to tailor each task to its unique, providing more flexibility to the user to tailor each task to its unique requirements.

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*mdc21Av81qccKfBhZ7myXg.png)

Todoist — Browser Extension UX Design

**The user can access a hidden side panel (on the left-hand side) from the main window. This comes as a great way to keep the screen size to a minimum, while still providing a lot of functionality.**

> [Discover professional UX design.](https://interface-design.co.uk/)

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*p8kKVu1wJzg1dxzKzICQ1g.png)

Todoist — Browser Extension UX Design

**On the right, there are more options (mostly view types), including different modes but also functions that allow users to sort and filter different tasks.**

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*4zlgBjFsA976MCOv2An3lQ.png)

Todoist — Browser Extension UX Design

Compared to Raindrop, **the different view modes here are handled on the same original screen, without changing the size of the pop-up window.**

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*Azx0JvGcSVG92G-JIFYxTA.png)

Todoist — Browser Extension UX Design

## Bubbles

**Bubbles are a peculiar choice when it comes to extensions**, **but are a quite practical choice by our standards.** Bubbles can be **utilised in many ways — from acting as stand-alone floating toolbars** that can be moved around the screen to bubbles **acting as simmered down side panels** that can also be opened when clicked.

[**Speechify**](https://speechify.com/?via=koo&gad_source=1&gclid=CjwKCAiAopuvBhBCEiwAm8jaMc8hlsmkpNXWXd2hekj9bJ3gpDnmNi6D8KwoFKqFP0lZkyTIyxpdIhoCt98QAvD_BwE) starts with a more simple bubble that only contains 3 options (Play, Screenshot to listen and Save for later). **On hover, the bubble expands to reveal a “Settings” and an “Import” option.** The final and most complex stage of the bubble is prompted when hitting Play. **Four more options appear and the bubble elongates. A great advantage that comes with this approach is that it enables the user to move the bubble around the screen and place it where they best see fit** (so as not to obstruct their view of the website’s content).

![](https://miro.medium.com/v2/resize:fit:206/1*JyUVeJqD2cAFhzc3BBcmxA.png)

![](https://miro.medium.com/v2/resize:fit:380/1*ObjFVdRKOBGzoR-QpluYbw.png)

Press enter or click to view image in full size![](https://miro.medium.com/v2/resize:fit:192/1*2Cp-esOXirCWCHCYc_kEyA.png)

Speechify — Browser Extensions UX Design

In case users only want to use Speechify on certain pages, or if they decide to briefly take a break from using the extension, **they may click the X at the bottom of the bubble and a pop-up will appear with options regarding the type of disabling wanted.**

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*fonmRAVbpwM9GF522Y6EHA.png)

Speechify — Browser Extensions UX Design

[**MaxA**I](https://www.maxai.me/) has a similar approach to that found in Speechify’s case. Similar to the aforementioned tool, MaxAI starts off small and expands on hover, revealing a set of actions the user can quickly select. **The catch is that all of these options eventually lead to the side panel opening automatically (because of the features themselves).**

## Get Creative Navy’s stories in your inbox

Join Medium for free to get updates from this writer.

Subscribe

Subscribe

Remember me for faster sign in

Take the summarise page as an example — the third feature from the top implies that a summary will appear somewhere. **Instead of moving the user to a different page (which might be quite a nuisance), it unravels into a side panel, maintaining the user’s original content in sight.**

![](https://miro.medium.com/v2/resize:fit:144/1*y0jSBUbXAZPLF4H3p6nuIA.png)

Press enter or click to view image in full size![](https://miro.medium.com/v2/resize:fit:294/1*EDp0h0fxgkGaBO0tfMCqhg.png)

Press enter or click to view image in full size![](https://miro.medium.com/v2/resize:fit:1028/1*A2dVMQjRr94aJBNA_X1TIw.png)

MaxAI — Browser Extensions UX Design

## Side panels

Side panels offer a perfect middle ground between pop-ups and full pages, as they inherit more screen real estate to expand on some features that work best in more breathable contexts or features that come as clusters. **Usually, these are accompanied by a small bubble or icon attached to the right (or left) side of the browser window.**

**This is a common practice that informs the user of the existence of a side panel while also acting as a trigger from which this side panel can be opened.**

![](https://miro.medium.com/v2/resize:fit:264/1*rFBc-3qwaTjEiiQg3Xw7UA.png)

Teal — Browser Extensions UX Design

[**Teal**](https://www.tealhq.com/) is a job search manager that serves the purpose of helping users save and track job offers, create alternative resumes and organise their applications.

**The side panel here showcases the job role, a section where the compensation amount can be added, an excitement level selection, and a stage selection (dropdown) alongside a list of the top 5 hard skills for the specific position.** All of these bits of information are relevant as details of the selected job role.

**Opting for a bubble or pop-up to display this info is not doable**. As a result, providing a **dedicated space on the same page as the starting website (included in a side panel) is the most logical approach.**

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*FXeGPoTabfAN4rd9cSwlGQ.png)

Teal — Browser Extensions UX Design

**Overall, the Teal extension uses space efficiently — by focusing on one task at a time (saving a job for instance)**. The **features are not crowded and whitespace is retained**, which helps the users easily skim through and complete their goal.

**A similar yet more haphazard approach can be seen in the Monica** extension (more specifically, in its use of the side panel). **The extension’s interface starts with a bubble (as seen with Teal), that upon being clicked, creates UX “chaos”.**

![](https://miro.medium.com/v2/resize:fit:158/1*dv2hrWY2yRPvJcPM6Gx0ng.png)

Monica — Browser Extensions UX Design

**The AI assistant comes with a great promise of fulfilling most, if not all, needs that a user might have from an extension.** Finding a user-friendly interface is, however, still a great challenge here. **The cards inside the panel come across as a clear attempt at organising and differentiating some key features.**

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*GfZQ7ESwOdRB6ELU-WhgJg.png)

Monica — Browser Extensions UX Design

**However, the poor colour choice makes it difficult to separate each section (imagine how hard it would be if a user is also visually impaired).** On the left side, there is a sidebar menu with even more features, and to top it all off, a chat box (with extra buttons and features) covers about 30% of the bottom of the panel.

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*AvGoUNEDqqirfKX5uM0d9g.png)

Monica — Browser Extensions UX Design

[**Merlin**](https://www.getmerlin.in/) is a good example of an AI assistant extension that offers more than a couple of simple features while making good use of space. **The designers used the principle of visual hierarchy to attract attention towards the most important features** (which are larger and are placed in the middle of the side panel).

![](https://miro.medium.com/v2/resize:fit:186/1*VuH4MuRx-AWnAhLP5DoXkg.png)

Merlin — Browser Extensions UX Design

**The designers included a section where the user can directly chat with the AI — however, the input field is at the bottom of the panel, accompanied by some key actions.** This chat function does not overlap or take up the space of any essential content.

Press enter or click to view image in full size![](https://miro.medium.com/v2/resize:fit:548/1*Qg3f7-1EFQmHmgEYZWz5sg.png)

Press enter or click to view image in full size![](https://miro.medium.com/v2/resize:fit:1224/1*RlKo0T8K9doS51NhH2US5g.png)

Merlin — Browser Extensions UX Design

**The use of whitespace creates a visual separation between the top features, settings, quick actions and chat section.** Extra options are hidden behind a “More” button in the top right corner — the design is not overcrowded.

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*Co3CIPXsEXnBnIUH4Vv1Ag.png)

Merlin — Browser Extensions UX Design

**Here is what to learn from this:**

- **While more complex side panels exist, if juggling a larger number of features**, it might be best to cross the threshold into a full-page view for your browser extension.

## Browser extension full-page

**Certain browser extensions include multiple complex features that are difficult to squeeze into a tight-window real estate environment** — like a pop-up.

**This is the best solution for these cases:**

- Create an independent page where these features can take advantage of the full width and height of the screen.

[**GoFullPage**](https://gofullpage.com/) is an extension that captures entire webpage screenshots. Once the screenshot is taken, a separate full-screen page will open. **The top bar is populated with key functions, such as saving the screenshot, editing it, deleting and so on.**

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*LlaCyxRK2WG1uszV3chR0Q.png)

GoFullPage — Browser Extensions UX Design

The [**Fake news debunker by InVID & WeVerify**](https://chromewebstore.google.com/detail/fake-news-debunker-by-inv/mhccpoafgdgbhnjfhkcmgknndkeenfhe) is another great example of a full-page plugin. **The extension actually looks like a full web app yet functions as a browser tool. Two navigation patterns are present — a sidebar and a top bar.**

**While this usually would not be considered a problem, the two elements are confusing (especially as “Tools” and “About” can be found in both areas).** There is another navigation pattern present on the Tools page — tabs with 5 options. The same options can be found in the side panel. “Other Tools” is, however, the exception.

**In a nutshell, the navigation is not done well.** There is no clear relationship between the two navigation patterns and this comes off as absolutely confusing.

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*rpS_hsZFSP_Red-HTiO5xw.png)

Fake news debunker — Browser Extensions UX Design

[**DeepL**](https://www.deepl.com/translator) is an online translation tool with an interesting browser extension. Once the user has highlighted text, a bubble appears, prompting a pop-up window to open. **This window contains a translation of the highlighted text (into the default language selected).** When visiting the settings section, a full page opens showcasing all of the options. **This is a nice way to separate these possible actions as they are quite different in nature.**

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*WCpJGLV7m0dP6mOsaJxawg.png)

DeepL — Browser Extensions UX Design

**The decision to opt for a full page instead of trying to fit every option in a crammed pop-up window shows good design thinking.** Changing the settings of an extension is a fairly rare action, **however, it is not a bad thing to take the user away from the current web page to deal with these decisions.**

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/1*e6tMkvRcQ4qTuttxQiVRSQ.png)

DeepL — Browser Extensions UX Design

## Takeaways

Both good examples and unfortunate ones have been discussed. **However, each type of layout mentioned has both (objective) pros and cons**. These cannot always be compared between types.

- **To choose the best fit for your project, take into consideration the context for which you are designing**, the number of features you want to display and the final purpose of the browser extension.
- Avoid automatically triggered extensions that bring up pop-ups — **unless extensive user testing has been done, proving that it is not too disruptive or simply annoying.**
- **Make use of UI elements which can reveal hidden functions such as accordions, drop downs and side panels** — to keep a clean design and save space efficiently on the interface.

> Check out some more of our comprehensive guides and build excellence:
> 
> [The Ultimate Guide to Web Wizard Design](https://medium.com/@creativenavy/the-ultimate-guide-to-web-wizard-design-5b6fb4201f94) 
> [HR Software Design Guidance](https://medium.com/@creativenavy/hr-software-exploring-ux-patterns-benchmarking-solutions-632d8d6a6efa) 
> [User Area Dashboards Design Guidance](https://medium.com/@creativenavy/user-area-design-guidance-for-dashboards-27deeb5f5fef)