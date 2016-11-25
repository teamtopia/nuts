shrinkpack:
	if ! test -d node_modules; then \
	    npm install; \
	fi ; \
	if ! test -x /usr/local/bin/shrinkpack -o -x /usr/bin/shrinkpack; then \
	    npm install -g shrinkpack; \
	    npm install -g shrinkwrap; \
	fi ; \
	if npm shrinkwrap --dev; then \
	    shrinkpack -c || shrinkpack; \
	fi

shrinkwrap: shrinkpack

test:
	npm run test

clean:
	rm -f nuts*.out nuts*.err

clean-travis:
	pkill node; \
	sleep 3; \
	pkill node; \
	sleep 3; \
	while read line; do rm -fr $$line; done <.gitignore
