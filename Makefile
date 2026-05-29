run:
	docker run \
		--network=host \
		--env-file=.env \
		-v union_data:/srv/root/.data \
		-it beatmap-service:latest

build:
	docker build -t beatmap-service:latest .
