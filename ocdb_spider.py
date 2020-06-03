import scrapy

def cleanws(s):
	s = ' '.join(s) if isinstance(s, list) else s
	return ' '.join(s.split())

class OcdbSpider(scrapy.Spider):
	name = 'ocdbspider'
	start_urls = ['https://ocdb.cc/episodes/']

	def __init__(self, ep_filter=None, *args, **kwargs):
		super().__init__(*args, **kwargs)
		self.ep_filter = ep_filter

	def parse(self, resp):
		for ep_link in resp.css('.episode_link > a ::attr(href)').getall():
			self.logger.info(f'got ep_link {ep_link}')
			if self.ep_filter is None or self.ep_filter in ep_link:
				yield resp.follow(ep_link, self.parse_ep)

	def parse_ep(self, resp):
		self.logger.info(f'parsing ep {resp.url}')
		ep_title = resp.css('.headline > h1 ::text').get().strip()
		ep_meta = cleanws(resp.css('.headline > h2.episode_meta ::text').get())
		self.logger.info(f'title: {ep_title} meta: {ep_meta}')

		cur_round = None
		for el in resp.css('.content > *'):
			if el.css('.question'):
				self.logger.info(f'got question in round {cur_round}')
				if cur_round in (1, 2):
					if el.css('.fa-music'):
						self.logger.info('skipping music question')
					elif el.css('.picture_clue'):
						self.logger.info('skipping picture clue')
					else:
						clue1 = cleanws(el.css('#clue1 ::text').getall())
						clue2 = cleanws(el.css('#clue2 div.back ::text').getall())
						clue3 = cleanws(el.css('#clue3 div.back ::text').getall())
						clue4 = cleanws(el.css('#clue4 div.back ::text').getall())
						answer = cleanws(el.css('.answer-show.back ::text').getall())
						self.logger.info(f'got clues:\n  clue1: {clue1}\n  clue2: {clue2}\n  clue3: {clue3}\n  clue4: {clue4}\n  answer: {answer}')
						yield {
							'ep_title': ep_title,
							'ep_meta': ep_meta,
							'round': cur_round,
							'clue1': clue1,
							'clue2': clue2,
							'clue3': clue3,
							'clue4': clue4,
							'answer': answer,
						}
			elif el.css('.vowel-round'):
				category = cleanws(el.css('.category ::text').get())
				self.logger.info(f'got vowel round category {category}')
				for q in el.css('.answer'):
					clue = cleanws(q.css('.puzzle.front ::text').get())
					answer = cleanws(q.css('.puzzle.back ::text').get())
					self.logger.info(f'  clue: {clue} answer: {answer}')
					yield {
						'ep_title': ep_title,
						'ep_meta': ep_meta,
						'round': 4,
						'category': category,
						'clue': clue,
						'answer': answer,
					}
			else:
				for i in range(4):
					if el.css(f'#round{i+1}'):
						self.logger.info(f'got round {i+1}')
						cur_round = i + 1

